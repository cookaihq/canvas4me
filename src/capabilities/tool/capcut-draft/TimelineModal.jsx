// src/capabilities/tool/capcut-draft/TimelineModal.jsx
// 时间线大模态框。Task 15:DraftSettingsBar + MaterialLibrary。
import { useState, useEffect, useMemo, useRef } from 'react'
import { message as antMessage } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { runCapcutDraft } from './runtime'
import './components/timelineModal.css'
import {
  materialFromContent,
  buildDefaultDisplayNames,
  getFileExtension,
  computeInitialTimeline,
  appendMaterialToTrack,
  reloadAllToTracks,
} from './timelineSpec'
import DraftSettingsBar from './components/DraftSettingsBar'
import AuthHintModal from './components/AuthHintModal'
import MaterialLibrary from './components/MaterialLibrary'
import TrackArea from './components/TrackArea'
import { useCapcutHelperStatus } from './hooks/useCapcutHelperStatus'
import { useDurationProbe } from './hooks/useDurationProbe'
export default function TimelineModal({ open, onClose, node, edges, nodes }) {
  const facade = useCanvasFacade()
  const [submitting, setSubmitting] = useState(false)
  const [activeTask, setActiveTask] = useState(null)
  const [showAuthHintModal, setShowAuthHintModal] = useState(false)
  const [pendingHint, setPendingHint] = useState(null)
  const helperStatus = useCapcutHelperStatus({ enabled: open, activeTask })
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

  // 收集连入的素材(rawMaterials 不含探测得到的 duration,下面再合并)
  // 折叠态 capability 的视频卡片:外壳 capability 上挂着用户起的名("3-1"/"4-1"),
  // 内嵌 output 节点上挂着真正的 url 但 name 通常为空。edge.source 指向 output 节点 →
  // src.data.name 取不到。反查 src 的入边,把所属 capability 的 name 作为 parentName 兜底。
  const rawMaterials = useMemo(() => {
    const incoming = edges.filter(e => e.target === node.id)
    const list = []
    for (const e of incoming) {
      const src = nodes.find(n => n.id === e.source)
      if (!src) continue

      let parentName = null
      if (!src.data?.name) {
        const inboundEdge = edges.find(ed => ed.target === src.id)
        if (inboundEdge) {
          const parent = nodes.find(n => n.id === inboundEdge.source)
          if (parent?.data?.name) parentName = parent.data.name
        }
      }
      const m = materialFromContent(src.id, src.data, { parentName })
      if (m) list.push(m)
    }
    return list
  }, [edges, nodes, node.id])

  // 后台探测时长缺失的 video/audio 素材;同时拿回 probe 用的 blob URL 给封面复用。
  // 注:duration 不写回源节点 —— 它是瞬时探测结果,只存在 hook 内部、在下面合并到 materials;
  // 关开模态会重探(blob 已缓存),无需持久化。完整缘由见 useDurationProbe.js 顶部说明。
  const { probeState, probedDurations, probeBlobUrls, retry: handleRetryProbe } = useDurationProbe(rawMaterials)

  // 合并探测结果:
  // - 原节点带的 naturalDurationSec 优先,缺失时用 probedDurations 兜底
  // - probeBlobUrl:probe 通过 fetch+blob 绕过了 OSS 的 Content-Disposition: attachment,
  //   把 blob URL 挂到素材上让 MaterialCover 复用,避免封面 <video> 直接喂原 URL 被 Chrome
  //   当下载文件 abort(MediaError code=4)
  const materials = useMemo(() => rawMaterials.map(m => {
    const blobUrl = probeBlobUrls.get(m.id)
    const needDuration = m.naturalDurationSec == null && probedDurations.has(m.id)
    if (!needDuration && !blobUrl) return m
    return {
      ...m,
      ...(needDuration ? { naturalDurationSec: probedDurations.get(m.id) } : {}),
      ...(blobUrl ? { probeBlobUrl: blobUrl } : {}),
    }
  }), [rawMaterials, probedDurations, probeBlobUrls])

  // timeline state 改为 useState(null) + useEffect,让"探测成功回写源节点 → materials 变化"
  // 能在未编辑状态下触发重铺
  const stored = node?.data?.modeParams?.default?.timeline
  const [timeline, setTimeline] = useState(null)

  // init effect 依赖结构签名而不是 materials 引用,避免 persist effect 回写 nodes → materials
  // 新引用 → init effect 重跑 → 又回写的死循环。签名编码 id+type+自然时长(probe 真正关心
  // 的三项);设计文档:docs/superpowers/specs/2026-05-15-capcut-helper-status-indicator-design.md
  const materialSignature = useMemo(
    () => materials.map(m => `${m.id}:${m.type}:${m.naturalDurationSec ?? 'null'}`).join('|'),
    [materials]
  )

  useEffect(() => {
    // 已编辑状态:不再重铺
    if (timeline?.userEdited === true) return
    // 用 timeline(若存在,即会话内的最新非轨道字段)作为基准;首次 timeline=null 时回退到 stored
    setTimeline(computeInitialTimeline(timeline ?? stored, materials))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialSignature])

  // 注入「不带后缀的显示名」+「扩展名」到素材,供素材库 UI 展示与 toCapcutSpec 拼 filename。
  const displayMaterials = useMemo(() => {
    if (!timeline) return []
    const defaults = buildDefaultDisplayNames(materials)
    const custom = timeline.materialFilenames || {}
    return materials.map(m => ({
      ...m,
      displayName: custom[m.id] ?? defaults.get(m.id),
      ext: getFileExtension(m),
    }))
  }, [materials, timeline])

  const handleFilenameChange = (materialId, newName) => {
    setTimeline(t => ({
      ...t,
      materialFilenames: { ...(t.materialFilenames || {}), [materialId]: newName },
    }))
  }

  // TrackArea 触发的 timeline 变更 = 用户编辑了轨道 → 自动带上 userEdited:true
  const handleTrackEdit = (next) => {
    setTimeline({ ...next, userEdited: true })
  }

  // 素材库「+」:把单个素材追加到对应类型轨道的末尾(同一素材可重复加)。
  // video/audio 缺时长由 appendMaterialToTrack 内部拒收(防御);UI 侧已通过
  // probeState 把 pending/failed 卡片的按钮隐藏掉。
  const handleAddToTrack = (material) => {
    setTimeline(t => ({ ...appendMaterialToTrack(t, material), userEdited: true }))
  }

  // 素材库「全部加载到轨道」:清空所有轨道,按 materials 顺序在四种类型独立 cursor 上重铺,
  // 保留 draftName / canvas / allowReplace / materialFilenames 等非轨道字段。
  const handleAddAll = () => {
    setTimeline(t => ({ ...reloadAllToTracks(t, materials), userEdited: true }))
  }

  // trust_url 唤起 + 兜底引导。设计 §4.3 时序：
  // 1) location.href = trust_url 尝试唤起 helper 桌面端授权弹窗
  // 2) 1500ms 后强制 recheck
  // 3) 再 800ms 后无论 cors_allowed 是否仍 false 都弹 AuthHintModal 兜底
  //    （AuthHintModal 内的"重试"按钮会再 recheck 一次；已授权场景 Badge 会自然切回
  //    emerald，Modal 视为多余但无副作用）
  const handleTrust = (trustUrl) => {
    // 先缓存当前 hint：recheck 一旦执行会把 state 切到 scan，state.health 暂时不可达，
    // AuthHintModal 没缓存就只能显示通用 DEFAULT_HINT 而失去 helper 提供的精准引导。
    const currentHint = helperStatus.state.type === 'health'
      ? helperStatus.state.health?.hint
      : null
    setPendingHint(currentHint)
    if (trustUrl) window.location.href = trustUrl
    setTimeout(() => {
      if (!isMountedRef.current) return
      helperStatus.recheck()
      setTimeout(() => {
        if (!isMountedRef.current) return
        setShowAuthHintModal(true)
      }, 800)
    }, 1500)
  }

  const handleOpenRelease = (url) => {
    if (url) window.open(url, '_blank', 'noopener')
  }

  const handleSubmit = async () => {
    if (!timeline) return
    setSubmitting(true)
    const result = await runCapcutDraft({
      nodeId: node.id,
      timeline,
      materials: displayMaterials,
      applyNodes: facade.batchUpdateNodes,
      onTaskUpdate: setActiveTask,
    })
    setSubmitting(false)
    if (result.ok) {
      antMessage.success('草稿已生成')
      // 首次同步:节点还没起过名(空 / "未命名")时把 draftName 写进 node.data.name.
      // 用户已起过名 → 保留, 不覆盖. 满足"自动同步 + 用户改名后不再覆盖"语义.
      const currentName = (node?.data?.name || '').trim()
      if (!currentName || currentName === '未命名') {
        facade.updateNodeData(node.id, { name: timeline.draftName })
      }
      // 让 Badge 的 "✓ {draft_name} 已完成" 停留 1.2s 再关模态框
      setTimeout(() => {
        if (!isMountedRef.current) return
        setActiveTask(null)
        onClose()
      }, 1200)
    } else {
      antMessage.error(result.error)
      setActiveTask(null)   // 失败时立即清掉 task 状态，让 Badge 切回 health 显示
    }
  }

  // 把 timeline 改动持久化到 node.data.modeParams.default.timeline
  // 守卫:timeline 为 null 时(初始化未完成)不要回写覆盖 stored
  useEffect(() => {
    if (timeline === null) return
    facade.batchUpdateNodes(nds => nds.map(n =>
      n.id === node.id
        ? {
          ...n,
          data: {
            ...n.data,
            modeParams: {
              ...(n.data.modeParams || {}),
              default: { ...(n.data.modeParams?.default || {}), timeline },
            },
          },
        }
        : n
    ))
  }, [timeline, node.id, facade])

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width="80vw"
        centered
        className="capcut-modal"
        title="剪映草稿 — 编辑时间线"
        destroyOnClose
      >
        <div className="capcut-modal-frame">
          {timeline ? (
            <>
              <DraftSettingsBar
                timeline={timeline}
                onChange={setTimeline}
                onSubmit={handleSubmit}
                submitting={submitting}
                submitDisabled={materials.length === 0}
                helperState={helperStatus.state}
                onRecheck={helperStatus.recheck}
                onTrust={handleTrust}
                onOpenRelease={handleOpenRelease}
              />
              <div className="capcut-main">
                <MaterialLibrary
                  materials={displayMaterials}
                  onFilenameChange={handleFilenameChange}
                  probeState={probeState}
                  onRetryProbe={handleRetryProbe}
                  onAddToTrack={handleAddToTrack}
                  onAddAll={handleAddAll}
                />
                <TrackArea
                  timeline={timeline}
                  materials={displayMaterials}
                  onTimelineChange={handleTrackEdit}
                />
              </div>
            </>
          ) : null}
        </div>
      </Modal>
      <AuthHintModal
        open={showAuthHintModal}
        hint={pendingHint}
        onRetry={() => {
          helperStatus.recheck()
          setShowAuthHintModal(false)
        }}
        onClose={() => setShowAuthHintModal(false)}
      />
    </>
  )
}
