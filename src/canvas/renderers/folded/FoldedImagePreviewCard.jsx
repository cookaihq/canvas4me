import { memo, useRef, useCallback, useEffect } from 'react'
import { Progress } from 'antd'
import { Image } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import FailedCard from '@/canvas/components/FailedCard'
import { getCapabilityErrorSummary } from '@/canvas/utils/errorFormatter'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'
import { fetchFileSize } from '@/canvas/utils/fileInfo'

/**
 * 折叠形态(form 'folded')的图片产物预览卡 — Runner 通用积木
 *
 * 适用 capability: 任何产物类型为 image 的 form 'folded' 能力 (GPT Image 2 / Nano Banana 等).
 *
 * 渲染逻辑:
 *   - 状态以下游 outputNode.data.runStatus 为准 (产物运行状态在 outputNode 上)
 *     如果还没建出 outputNode (Ready 时尚未运行), 退化为本能力节点 data.runStatus
 *   - Ready  : 占位提示
 *   - Running: 进度条 (pollProgress.progress) + Generating...
 *   - Done   : 单图渲染原生 <img>(点击落到 React Flow 选中节点, 不弹预览);
 *             content.placeholder=true 时渲染"未生成"占位
 *   - Failed : 错误信息 + 重试按钮
 *
 * 节点尺寸联动:
 *   - header 通过 NodeToolbar 浮在节点物理区外, 节点 = 纯图片, body 高 = 节点高 100%
 *   - Done 单图: 图片 onLoad 后把 aspect 写回 node.data._imageAspect, CapabilityNode
 *     据此在 NodeResizer onResize 时按 aspect 严格联动节点 width/height,
 *     使节点 body 区严格匹配图片宽高比 → 图片 object-fit:cover 视觉无白边/无裁剪/无变形
 */

function FoldedImagePreviewCard({ nodeId, data, downstreamOutputNode, readyHint = '点击 Run 开始生成' }) {
  // 真实状态: 优先看下游 outputNode (产物的实际状态), 否则退化为能力节点 runStatus
  const outputData = downstreamOutputNode?.data
  const runStatus = outputData?.runStatus || data?.runStatus
  const status = normalizeRunStatus(runStatus)

  const content = outputData?.content || null
  const url = content?.url || null
  const isPlaceholder = content?.placeholder === true

  // 优先用 content.rawError (完整原始对象, 给 ErrorLogModal 显示完整 JSON),
  // 没有时回退到 content.error (预拼字符串, 兼容老画布数据 + SSE validator failed 等无 rawError 场景)
  const rawError = outputData?.content?.rawError
    ?? outputData?.content?.error
    ?? outputData?.error
    ?? data?.error
    ?? null

  const { runCapability } = useCapabilityRuntime()
  const capabilityId = data?.capability
  const summary = status === 'Failed'
    ? getCapabilityErrorSummary(capabilityId, rawError)
    : ''
  const onRetry = (status === 'Failed' && nodeId)
    ? () => runCapability?.(nodeId, 1)
    : undefined

  return (
    <div className="folded-image-preview" style={{ height: '100%' }}>
      {status === 'Ready' && <ReadyView hint={readyHint} />}
      {(status === 'Running' || status === 'Polling' || status === 'Streaming') && <RunningView pollProgress={outputData?.pollProgress} />}
      {status === 'Done' && isPlaceholder && <PlaceholderView />}
      {status === 'Done' && !isPlaceholder && url && <SingleImageView url={url} capabilityNodeId={nodeId} />}
      {status === 'Done' && !isPlaceholder && !url && <ReadyView hint="未找到产物 URL" />}
      {status === 'Failed' && (
        <FailedCard summary={summary} rawError={rawError} onRetry={onRetry} />
      )}
    </div>
  )
}

function ReadyView({ hint }) {
  return (
    <div className="folded-image-preview-empty">
      <Image className="folded-image-preview-empty-icon" />
      <span className="folded-image-preview-empty-text">{hint}</span>
    </div>
  )
}

function RunningView({ pollProgress }) {
  const percent = Number.isFinite(pollProgress?.progress)
    ? Math.max(0, Math.min(100, pollProgress.progress))
    : 0
  return (
    <div className="folded-image-preview-running">
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        strokeColor="#3B82F6"
      />
      <span className="folded-image-preview-running-text">Generating... {percent}%</span>
    </div>
  )
}

function SingleImageView({ url, capabilityNodeId }) {
  const { displayUrl, ready } = useMediaSource(url, { kind: 'image' })
  const imgRef = useRef(null)
  const facade = useCanvasFacade()

  // onLoad 回写 capability 节点 data:
  //   _imageAspect — 驱动节点尺寸联动
  //   _mediaWidth/_mediaHeight — 供 FoldedNodeMeta 右段显示分辨率
  // 注: 不写下游 outputNode, 因为折叠态下它已从 ReactFlow store 过滤, setNodes 无法命中.
  const onImgLoad = useCallback((e) => {
    const w = e.target.naturalWidth
    const h = e.target.naturalHeight
    if (!(w > 0 && h > 0)) return
    const aspect = w / h
    if (!capabilityNodeId) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== capabilityNodeId) return n
      const data = n.data || {}
      const aspectSame = Math.abs((data._imageAspect || 0) - aspect) < 0.001
      const sizeSame = data._mediaWidth === w && data._mediaHeight === h
      if (aspectSame && sizeSame) return n
      return { ...n, data: { ...data, _imageAspect: aspect, _mediaWidth: w, _mediaHeight: h } }
    }))
  }, [facade, capabilityNodeId])

  // 拿 fileSize: 对 url 发 HEAD 取 Content-Length, 写回 capability 节点 data._mediaFileSize
  useEffect(() => {
    if (!url || !capabilityNodeId) return
    let alive = true
    fetchFileSize(url).then((bytes) => {
      if (!alive || bytes == null) return
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== capabilityNodeId) return n
        if (n.data?._mediaFileSize === bytes) return n
        return { ...n, data: { ...n.data, _mediaFileSize: bytes } }
      }))
    })
    return () => { alive = false }
  }, [url, capabilityNodeId, facade])

  return (
    <div className="folded-image-preview-single">
      {ready && displayUrl ? (
        <img
          src={displayUrl}
          alt="generated"
          ref={imgRef}
          onLoad={onImgLoad}
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="folded-image-preview-loading" />
      )}
    </div>
  )
}

function PlaceholderView() {
  return (
    <div className="folded-image-preview-placeholder">
      <Image className="folded-image-preview-placeholder-icon" />
      <span className="folded-image-preview-placeholder-text">未生成</span>
    </div>
  )
}

export default memo(FoldedImagePreviewCard)
