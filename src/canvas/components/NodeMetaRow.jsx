import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasFacade } from '../state/canvasFacade'
import { SafeInput } from './CompositionSafeInput'
import NodeElapsedBadge from './NodeElapsedBadge'
import { useCanvasEditing } from '../contexts/CanvasEditingContext'
import { useNodeSeq } from '../state/canvasDerived'

function isProcessingStatus(runStatus) {
  return runStatus === 'running' || runStatus === 'polling' || runStatus === 'streaming' || runStatus === 'validating'
}

/**
 * NodeMetaRow — 节点上方外挂的元数据 (无 bg / border / padding)
 *
 * Layout:  [#seq · name]              [运行态 elapsed chip · 或 · 终态 info 文件元数据]
 *
 * 左右两段各是一个 position:absolute 元素, 直接挂在节点 DOM 内 (top:-24, 左段 left:0 /
 * 右段 right:0), 用 transform: scale(1/zoom) 反向缩放保持视觉恒定大小 (zoom>=0.5),
 * 与端口标签同一套策略 (--rf-zoom)。
 *
 * 关键: meta 跟节点同一个 stacking context — DOM order 后绘的节点会自然覆盖前绘节点
 * 的所有可见内容 (含 meta), 不会像 portal 浮层那样把下层节点的 meta 飞到上层节点身上。
 *
 * 右侧 slot 优先级 (二选一, 不同时存在):
 *   1. runStatus 处于进行态 (running/polling/streaming/validating) 且有 startedAt
 *      → 渲染 NodeElapsedBadge chip (青底 ⚡ + 实时耗时)
 *   2. info 有值 → 渲染 info 纯文字 (终态文件元数据 / tokens 等)
 *
 * 字段:
 *   - nodeId: 节点 id (name 编辑提交时 setNodes 命中)
 *   - seq:    可选, 画布序号显式覆盖; 缺省时内部用 useNodeSeq(nodeId) 即时取序号;
 *             非 number 时不渲染序号段
 *   - name:   节点名 (data.name); undefined 时不渲染名称段 (note 等无名节点);
 *             空字符串 / null 时显示"未命名" italic 占位 (普通节点)
 *   - info:   可选, 终态文件元数据 (如 "1920×1080 · 12MB" / "412 Tokens")
 *   - infoTitle: 可选, info 的 tooltip; 缺省用 info 文本
 *   - runStatus / startedAt / finishedAt / timedOut: 可选, 进行态 elapsed chip 数据
 *
 * 选中态色阶由 CSS 祖先选择器 .react-flow__node.selected .node-meta-* 接管。
 */
function NodeMetaRow({ nodeId, seq: seqOverride, name, namePlaceholder, info, infoTitle, runStatus, startedAt, finishedAt, timedOut }) {
  const derivedSeq = useNodeSeq(nodeId)
  const seq = typeof seqOverride === 'number' ? seqOverride : derivedSeq
  const hasLeft = typeof seq === 'number' || name !== undefined
  const showElapsed = isProcessingStatus(runStatus) && Boolean(startedAt)
  const hasRight = showElapsed || Boolean(info)
  return (
    <>
      {hasLeft && (
        <div className="node-meta-row node-meta-row-left" onMouseDown={(e) => e.stopPropagation()}>
          {typeof seq === 'number' && (
            <span className="node-meta-seq">#{seq}</span>
          )}
          {name !== undefined && <NodeMetaName nodeId={nodeId} name={name} placeholder={namePlaceholder} />}
        </div>
      )}
      {hasRight && (
        <div className="node-meta-row node-meta-row-right" onMouseDown={(e) => e.stopPropagation()}>
          {showElapsed ? (
            <NodeElapsedBadge
              startedAt={startedAt}
              finishedAt={finishedAt}
              runStatus={runStatus}
              timedOut={timedOut}
            />
          ) : (
            <span className="node-meta-info" title={infoTitle || info}>{info}</span>
          )}
        </div>
      )}
    </>
  )
}

/**
 * Meta 行内联节点名编辑器 — 单击进入编辑态, Enter / blur 提交, Esc 取消.
 * 只读模式(isEditing=false)下不可点击编辑; 空名字完全隐藏(连"未命名"也不显示).
 */
function NodeMetaName({ nodeId, name, placeholder }) {
  const ph = placeholder || '未命名'
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
    facade.batchUpdateNodes((nds) => nds.map((n) => (
      n.id === nodeId ? { ...n, data: { ...n.data, name: next } } : n
    )))
    setEditing(false)
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
        placeholder={ph}
        bordered
        className="node-meta-name-input"
      />
    )
  }

  const isEmpty = !name
  // 只读模式: 空名字完全隐藏 (跟旧 NodeNameLabel 行为对齐)
  if (!isEditing && isEmpty) return null

  return (
    <span
      className={`node-meta-name ${isEmpty ? 'node-meta-name-empty' : ''}`}
      title={name || ph}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleEnterEdit}
    >
      {name || ph}
    </span>
  )
}

export default memo(NodeMetaRow)
