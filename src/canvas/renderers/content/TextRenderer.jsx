import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { useCanvasFacade } from '../../state/canvasFacade'

/**
 * 文本渲染器 — 节点卡片内的文本预览 / 就地编辑
 * - 双击进入编辑态并 stopPropagation（只把光标聚焦进 textarea，不触发画布缩放聚焦）；locked 时不进入编辑、放行冒泡以保留双击看大图
 * - 编辑态渲染原生 textarea，IME 组合期间只更新本地 state，避免打断输入
 * - onBlur / Esc 退出编辑
 * - locked 时双击不进入编辑态
 * - 字数显示由 InputNode → NodeMetaRow 的 info 段统一渲染在节点头右侧 ("N 字"),
 *   此处不再渲染卡内字数徽章
 */
function TextRenderer({ data, nodeId }) {
  const text = data.content?.text || ''
  const locked = data.locked

  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(text)
  const composingRef = useRef(false)
  const textareaRef = useRef(null)
  const facade = useCanvasFacade()

  // 外部 text 变化时同步本地 state（非 IME 组合期间）
  useEffect(() => {
    if (!composingRef.current && !editing) {
      setLocalValue(text)
    }
  }, [text, editing])

  // 进入编辑态：聚焦并把光标置末尾
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  }, [editing])

  const commit = useCallback((value) => {
    facade.batchUpdateNodes((nds) => nds.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, content: { ...n.data.content, text: value } } }
        : n
    ))
  }, [nodeId, facade])

  const handleDoubleClick = useCallback((e) => {
    if (locked) return
    e.stopPropagation()
    setLocalValue(text)
    setEditing(true)
  }, [locked, text])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setLocalValue(val)
    if (!composingRef.current) {
      commit(val)
    }
  }, [commit])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((e) => {
    composingRef.current = false
    commit(e.target.value)
  }, [commit])

  const handleBlur = useCallback(() => {
    setEditing(false)
  }, [])

  const handleKeyDown = useCallback((e) => {
    e.stopPropagation()
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(false)
    }
  }, [])

  if (editing && !locked) {
    return (
      <div className="renderer-text">
        <textarea
          ref={textareaRef}
          className="renderer-text-editor nodrag nowheel"
          value={localValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="输入文本..."
        />
      </div>
    )
  }

  return (
    <div
      className={`renderer-text${locked ? ' renderer-locked' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      <div className="renderer-text-content">
        {text || <span className="renderer-placeholder">双击输入文本...</span>}
      </div>
      {locked && <div className="renderer-lock-badge">🔒</div>}
    </div>
  )
}

export default memo(TextRenderer)
