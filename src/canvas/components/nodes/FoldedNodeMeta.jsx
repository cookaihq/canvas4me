import { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useCanvasFacade } from '../../state/canvasFacade'
import { Loader2, CheckCircle, AlertCircle } from '@/canvas/icons'
import { resolveModeId } from '../../registry/nodeTypes'
import { useNodeSeq } from '../../state/canvasDerived'
import { SafeInput } from '../CompositionSafeInput'
import NodeElapsedBadge from '../NodeElapsedBadge'
import { useCanvasEditing } from '../../contexts/CanvasEditingContext'
import { emitEvent } from '@/utils/eventBus'

function isProcessingStatus(runStatus) {
  return runStatus === 'running' || runStatus === 'polling' || runStatus === 'streaming' || runStatus === 'validating'
}

/**
 * 折叠形态(form 'folded') 能力节点的 NodeMeta 外挂行
 *
 * 视觉(浮在节点上方, 无背景/边框/内边距, 纯文字):
 *   #编号  节点名                                         分辨率 · 大小
 *
 * 左右各一段 position:absolute 直接挂在节点 DOM 内 (top:-24, 左段 left:0 / 右段 right:0),
 * 用 transform: scale(1/zoom) 反向缩放保持视觉恒定大小 (zoom>=0.5), 与端口标签同一套
 * 策略 (--rf-zoom)。meta 跟节点同一 stacking context — 后绘节点自然覆盖前绘节点的 meta,
 * 不会把下层节点的 meta 飞到上层节点身上。选中态由 CSS 祖先选择器接管。
 *
 * 字段来源:
 *   - seq:       useNodeSeq(nodeId) (派生序号)
 *   - name:      data.name (可单击编辑, IME 安全输入)
 *   - info:      _mediaWidth/_mediaHeight (产物分辨率) + _mediaDuration (视频时长)
 *                + _mediaFileSize / downstreamOutputNode.content.fileSize (文件大小)
 *
 * debugMode 输出按钮不在此渲染, 由 FoldedDebugOutputButton 单独浮在图片右上角.
 */

function FoldedNodeMeta({ side = 'left', nodeId, data, downstreamOutputNode }) {
  if (side === 'right') {
    return <FoldedNodeMetaInfo nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} />
  }
  return <FoldedNodeMetaLeft nodeId={nodeId} data={data} />
}

function FoldedNodeMetaLeft({ nodeId, data }) {
  const derivedSeq = useNodeSeq(nodeId)
  const seq = typeof derivedSeq === 'number' ? derivedSeq : null
  return (
    <div className="folded-node-meta folded-node-meta-left" onMouseDown={(e) => e.stopPropagation()}>
      {seq != null && (
        <span className="folded-node-meta-seq">#{seq}</span>
      )}
      <FoldedNodeMetaNameEditor nodeId={nodeId} name={data?.name} />
    </div>
  )
}

function FoldedNodeMetaInfo({ nodeId, data, downstreamOutputNode }) {
  const outputData = downstreamOutputNode?.data
  const capability = data?.capability
  const modeId = capability ? resolveModeId(capability, data.mode) : null

  // 右侧 slot 优先级:
  //   1. 下游产物进行态 (running/polling/streaming) 且有 startedAt → elapsed chip
  //   2. LLM done 态有 usage.total_tokens                          → "${N} Tokens"
  //   3. 媒体节点 (image/video/audio) 终态                          → "分辨率 · 时长 · 大小"
  // 三者不同时出现 (语义互斥)
  const showElapsed = isProcessingStatus(outputData?.runStatus) && Boolean(outputData?.startedAt)

  const resolutionText = useMemo(
    () => deriveResolutionText({
      mediaWidth: data?._mediaWidth,
      mediaHeight: data?._mediaHeight,
      downstreamOutputNode,
      modeParams: modeId ? data?.modeParams?.[modeId] : null,
    }),
    [data?._mediaWidth, data?._mediaHeight, downstreamOutputNode, data?.modeParams, modeId]
  )
  const durationText = useMemo(() => formatDuration(data?._mediaDuration), [data?._mediaDuration])
  const fileSizeText = useMemo(
    () => formatFileSize(data?._mediaFileSize ?? outputData?.content?.fileSize),
    [data?._mediaFileSize, outputData?.content?.fileSize]
  )
  const mediaInfoText = [resolutionText, durationText, fileSizeText].filter(Boolean).join(' · ')

  // LLM done: tokens 跟"图片/视频节点 meta 右上角的文件大小"在视觉上对齐为同一档"产物量化信息"
  const totalTokens = outputData?.usage?.total_tokens
  const tokensText = capability === 'llm'
    && outputData?.runStatus === 'done'
    && Number.isFinite(totalTokens)
    ? `${totalTokens} Tokens`
    : null

  const infoText = tokensText || mediaInfoText

  // 第三分支: 折叠节点无下游 outputNode (目前仅 tool/capcut-draft, outputs=[]) —
  // 节点自身就是终态承载, 用 data.runStatus 渲染状态徽章 (Loader/Check/Alert + 颜色文字).
  // 有下游产物的能力 (image/video/llm/audio) 命中前两个分支, 不影响其行为.
  const ownStatusBadge = !downstreamOutputNode
    ? renderOwnRunStatusBadge(data?.runStatus, data?.runProgress ?? data?.capcutProgress)
    : null

  if (!showElapsed && !infoText && !ownStatusBadge) return null

  return (
    <div className="folded-node-meta folded-node-meta-right" onMouseDown={(e) => e.stopPropagation()}>
      {showElapsed ? (
        <NodeElapsedBadge
          startedAt={outputData.startedAt}
          finishedAt={outputData.finishedAt}
          runStatus={outputData.runStatus}
          timedOut={Boolean(outputData.content?.pollingTimeout || outputData.content?.sseTimeout)}
        />
      ) : ownStatusBadge ? (
        ownStatusBadge
      ) : (
        <span className="folded-node-meta-info" title={infoText}>{infoText}</span>
      )}
    </div>
  )
}

// 折叠节点无下游 outputNode 时使用: 把节点自身 runStatus 渲染为右侧 meta 状态徽章.
// 进度字段优先 data.runProgress (通用约定), 兜底 data.capcutProgress (capcut 现有字段, 不强制改 runtime).
function renderOwnRunStatusBadge(runStatus, progress) {
  if (runStatus === 'polling' || runStatus === 'running') {
    return (
      <span className="folded-node-meta-status folded-node-meta-status-running">
        <Loader2 size={11} className="folded-node-meta-status-spin" />
        {typeof progress === 'number' ? `${progress}%` : '处理中'}
      </span>
    )
  }
  if (runStatus === 'done') {
    return (
      <span className="folded-node-meta-status folded-node-meta-status-done">
        <CheckCircle size={11} />
        已完成
      </span>
    )
  }
  if (runStatus === 'error' || runStatus === 'Failed') {
    return (
      <span className="folded-node-meta-status folded-node-meta-status-failed">
        <AlertCircle size={11} />
        失败
      </span>
    )
  }
  return null
}

/**
 * Meta 行内联节点名编辑器 — 单击进入编辑态, Enter / blur 提交, Esc 取消
 * 仿 NodeNameLabel 行为, 但去掉绝对定位; 只读模式下不可点击编辑
 */
function FoldedNodeMetaNameEditor({ nodeId, name, placeholder = '未命名' }) {
  const facade = useCanvasFacade()
  const { isEditing } = useCanvasEditing()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name || '')
  const committedRef = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(name || '')
  }, [name, editing])

  useEffect(() => {
    if (!isEditing && editing) {
      committedRef.current = true
      setEditing(false)
    }
  }, [isEditing, editing])

  const commit = useCallback((value) => {
    if (committedRef.current) return
    committedRef.current = true
    const next = (value ?? '').trim()
    facade.batchUpdateNodes(nds => nds.map(n => (
      n.id === nodeId ? { ...n, data: { ...n.data, name: next } } : n
    )))
    setEditing(false)
    // 跳过 autosave 2s debounce, 立即持久化避免用户 < 2s 内刷新丢数据。
    // setTimeout(0) 延后到下一个 tick — React 18 batch: setNodes 在事件循环
    // 结束后才 flush, useAutoSave 的 nodesRef 通过 useEffect 更新, 同步 emitEvent
    // 会让 doSave 读到 setNodes 前的旧 nodes → 保存旧值。延后到 next tick 让
    // React 完成 render + nodesRef 已更新, doSave 读到新 nodes。
    setTimeout(() => emitEvent('canvas:request-immediate-save'), 0)
  }, [nodeId, facade])

  const cancel = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    setDraft(name || '')
    setEditing(false)
  }, [name])

  const handleEnterEdit = useCallback((e) => {
    e.stopPropagation()
    if (!isEditing) return
    committedRef.current = false
    setDraft(name || '')
    setEditing(true)
  }, [name, isEditing])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }, [draft, commit, cancel])

  if (editing) {
    return (
      <SafeInput
        size="small"
        autoFocus
        value={draft}
        onChange={setDraft}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        bordered
        className="folded-node-meta-name-input"
      />
    )
  }

  const isEmpty = !name
  const display = name || placeholder
  return (
    <span
      className={`folded-node-meta-name ${isEmpty ? 'folded-node-meta-name-empty' : ''}`}
      title={display}
      onClick={handleEnterEdit}
    >
      {display}
    </span>
  )
}

function deriveResolutionText({ mediaWidth, mediaHeight, downstreamOutputNode, modeParams }) {
  // 优先: capability 节点 data._mediaWidth/_mediaHeight (产物图加载完后由 FoldedImagePreviewCard 回写)
  const mw = pickNumber(mediaWidth)
  const mh = pickNumber(mediaHeight)
  if (mw && mh) return `${mw}×${mh}`
  // 兜底 1: 下游 outputNode 上可能已有 width/height (历史画布数据 / 上游 webhook 带回)
  const content = downstreamOutputNode?.data?.content
  if (content) {
    const w = pickNumber(content.width, content.naturalWidth, content?.size?.width)
    const h = pickNumber(content.height, content.naturalHeight, content?.size?.height)
    if (w && h) return `${w}×${h}`
  }
  // 兜底 2: 面板选的目标分辨率 (Ready 态还没产物时也能显示意图分辨率)
  if (modeParams) {
    const res = typeof modeParams.resolution === 'string' ? modeParams.resolution : null
    if (res && /^\d+x\d+$/i.test(res)) return res.replace(/x/i, '×')
    const w = pickNumber(modeParams.width)
    const h = pickNumber(modeParams.height)
    if (w && h) return `${w}×${h}`
  }
  return null
}

function pickNumber(...vals) {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return null
}

function formatDuration(seconds) {
  const n = typeof seconds === 'number' ? seconds : Number(seconds)
  if (!Number.isFinite(n) || n <= 0) return null
  const total = Math.round(n)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatFileSize(bytes) {
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} K`
  return `${(n / (1024 * 1024)).toFixed(2)} M`
}

export default memo(FoldedNodeMeta)
