// 后台探测视频/音频素材的真实时长 + 复用 blob URL 给素材封面渲染。
//   - 输入:materials(每项含 id/type/url/naturalDurationSec/sourceNodeId)
//   - 输出:{ probeState: Map<materialId, 'pending'|'failed'|'done'>,
//          probedDurations: Map<materialId, number>,
//          probeBlobUrls: Map<materialId, string>,
//          retry(materialId) }
//   - 行为:
//     - 扫描 effect:对未探测过的缺时长素材启动 hidden <video> 探测
//     - "正在进行" 守卫用 activeProbesRef,不用 probeState(避免 setState→re-render→cleanup 自残)
//     - loadedmetadata + duration > 0 → 写入 probedDurations[id] = dur,probeState 标 'done',
//       并把 probe 用的 blob URL 转交给 probeBlobUrls(供 MaterialCover 渲染封面)
//     - error / 10s 超时 → probeState 标 'failed',revoke blob URL
//     - retry(materialId) 清出 probeState + probedDurations + revoke 旧 blob URL
//   - 为什么封面要共用 probe 的 blob URL:
//     OSS 返回 Content-Disposition: attachment + Content-Type: octet-stream,<video> 直接
//     拉原 URL 会被 Chrome 当下载文件 abort(MediaError code=4)。 probe 已经 fetch 成 blob
//     绕开了 attachment,直接复用同一份 blob 即可,避免封面静默白屏。
//   - 卸载时:独立的 cleanup-only effect 主动 abort 所有还在进行中的 probe + revoke 所有
//     保留的 blob URL;用 wasReallyMountedRef 跳过 React 18 dev StrictMode 的
//     mount→cleanup→re-mount 双触发
//
// 为什么不写回源节点 data.content.duration:
//   duration 是关掉模态框就失效的瞬时探测结果,留在 hook 内部即可——关掉再开会重探一次,
//   blob 已缓存 <100ms 拿到,没必要持久化进节点 data。
//   (历史上还有一个技术原因:折叠 output 节点曾被排除在画布渲染列表外、setNodes 写不进它;
//   该限制已随画布渲染层重构失效——折叠 output 现以占位形态留在 store 内、setNodes 可达。
//   是否改为写回属独立的持久化策略问题,见 docs/BACKLOG.md。)
import { useEffect, useState, useCallback, useRef } from 'react'
import { planProbes } from '../timelineSpec'
import { cacheMatch } from '@/canvas/utils/mediaCache/cache'
import { getProxyUrl } from '@/utils/proxyUrl'

const PROBE_TIMEOUT_MS = 10_000

// 把原 URL 转成 <video> 能可靠加载的 URL:
// 1. 命中 Cache API(画布的 useMediaSource / ensureVideoCached 已缓存)→ 转 blob URL
// 2. 未命中 → fetch(proxy) → blob URL
// 3. 仍失败 → 返回原 URL,让 <video> 走自然报错路径
// 原因:OSS 返回 Content-Disposition: attachment + Content-Type: octet-stream,
// <video> 直接拉原 URL 会被 Chrome 当成下载文件 abort,触发 MediaError code=4。
async function resolveProbeUrl(originalUrl) {
  try {
    const hit = await cacheMatch(originalUrl)
    if (hit) {
      const blob = await hit.blob()
      if (blob && blob.size > 0) {
        return { url: URL.createObjectURL(blob), isBlob: true }
      }
    }
  } catch { /* 降级到 fetch */ }
  try {
    const resp = await fetch(getProxyUrl(originalUrl), { mode: 'cors' })
    if (resp.ok) {
      const blob = await resp.blob()
      if (blob && blob.size > 0) {
        return { url: URL.createObjectURL(blob), isBlob: true }
      }
    }
  } catch { /* 仍降级 */ }
  return { url: originalUrl, isBlob: false }
}

export function useDurationProbe(materials) {
  const [probeState, setProbeState] = useState(() => new Map())
  const [probedDurations, setProbedDurations] = useState(() => new Map())
  const [probeBlobUrls, setProbeBlobUrls] = useState(() => new Map())
  const activeProbesRef = useRef(new Map())     // materialId → { video, timer, cleanup }
  const blobUrlsRef = useRef(new Map())         // probeBlobUrls 的 ref 镜像;unmount-only cleanup 用

  // 扫描 + 启动 probe。不返回 cleanup —— 中止只在 unmount-only effect 里做。
  useEffect(() => {
    // planProbes 按 probeState 过滤(pending/failed/done 都不再重启;pending 短暂态由 activeProbesRef 兜底)
    const toProbe = planProbes(materials, probeState)
    if (toProbe.length === 0) return

    const matById = new Map(materials.map(m => [m.id, m]))
    for (const id of toProbe) {
      // 二重防御:即使 planProbes 漏过,activeProbesRef 也阻止重复启动
      if (activeProbesRef.current.has(id)) continue
      const m = matById.get(id)
      if (!m) continue

      // 在异步 resolveProbeUrl 完成前先占位(避免 effect 重跑重复启动);
      // 占位 handle 的 cleanup 会把 aborted 翻成 true,async IIFE 看到后自行收尾。
      let aborted = false
      let blobUrlToRevoke = null
      const placeholder = {
        cleanup() {
          aborted = true
          if (blobUrlToRevoke) {
            URL.revokeObjectURL(blobUrlToRevoke)
            blobUrlToRevoke = null
          }
          activeProbesRef.current.delete(id)
        },
      }
      activeProbesRef.current.set(id, placeholder)
      // 进入 pending 态。即使后续 resolveProbeUrl 还没回来,UI 也能展示「探测中」。
      setProbeState(prev => new Map(prev).set(id, 'pending'))

      ;(async () => {
        const { url: probeUrl, isBlob } = await resolveProbeUrl(m.url)
        if (aborted) {
          if (isBlob) URL.revokeObjectURL(probeUrl)
          return
        }
        if (isBlob) blobUrlToRevoke = probeUrl

        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true

        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onSuccess)
          video.removeEventListener('error', onError)
          clearTimeout(timer)
          video.removeAttribute('src')
          try { video.load() } catch { /* noop */ }
          if (blobUrlToRevoke) {
            URL.revokeObjectURL(blobUrlToRevoke)
            blobUrlToRevoke = null
          }
          activeProbesRef.current.delete(id)
        }
        const onSuccess = () => {
          const dur = video.duration
          if (Number.isFinite(dur) && dur > 0) {
            setProbedDurations(prev => new Map(prev).set(id, dur))
            setProbeState(prev => new Map(prev).set(id, 'done'))
            // 成功:把 blob URL 转交给 probeBlobUrls,cleanup 不再 revoke,让 MaterialCover 复用
            if (isBlob && blobUrlToRevoke) {
              blobUrlsRef.current.set(id, blobUrlToRevoke)
              setProbeBlobUrls(prev => new Map(prev).set(id, blobUrlToRevoke))
              blobUrlToRevoke = null
            }
          } else {
            setProbeState(prev => new Map(prev).set(id, 'failed'))
          }
          cleanup()
        }
        const onError = () => {
          setProbeState(prev => new Map(prev).set(id, 'failed'))
          cleanup()
        }

        video.addEventListener('loadedmetadata', onSuccess)
        video.addEventListener('error', onError)
        const timer = setTimeout(onError, PROBE_TIMEOUT_MS)
        video.src = probeUrl

        // 升级占位 handle:把 cleanup 替换成完整版,unmount-only effect 用它收尾。
        activeProbesRef.current.set(id, { video, timer, cleanup })
      })()
    }
  }, [materials, probeState])

  // 卸载-only cleanup:中止所有进行中的 probe。
  // React 18 dev StrictMode 会把空依赖 effect 双触发(mount → cleanup → re-mount),
  // 直接执行 cleanup 会把刚创建的 <video> 立即杀掉 → 探测全失败。
  // 用 setTimeout(_, 0) 在宏任务里把 wasReallyMounted 置 true:StrictMode 模拟
  // unmount 是同步的,clearTimeout 会撤掉这个置位 → cleanup 跳过;真正 unmount 时
  // 宏任务已跑过 wasReallyMounted=true → 正常 cleanup。
  const wasReallyMountedRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => { wasReallyMountedRef.current = true }, 0)
    return () => {
      clearTimeout(t)
      if (!wasReallyMountedRef.current) return
      for (const handle of activeProbesRef.current.values()) {
        handle.cleanup()
      }
      activeProbesRef.current.clear()
      // 模态关闭:统一 revoke 所有保留的封面 blob URL
      for (const url of blobUrlsRef.current.values()) {
        URL.revokeObjectURL(url)
      }
      blobUrlsRef.current.clear()
    }
  }, [])

  const retry = useCallback((materialId) => {
    setProbeState(prev => {
      const next = new Map(prev)
      next.delete(materialId)
      return next
    })
    setProbedDurations(prev => {
      if (!prev.has(materialId)) return prev
      const next = new Map(prev)
      next.delete(materialId)
      return next
    })
    // 旧 blob URL 不再有用,revoke 后清出 state(下次探测成功会重新写入)
    const oldUrl = blobUrlsRef.current.get(materialId)
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl)
      blobUrlsRef.current.delete(materialId)
    }
    setProbeBlobUrls(prev => {
      if (!prev.has(materialId)) return prev
      const next = new Map(prev)
      next.delete(materialId)
      return next
    })
  }, [])

  return { probeState, probedDurations, probeBlobUrls, retry }
}
