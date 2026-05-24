import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { NodeResizer, useReactFlow } from '@xyflow/react'
import NodeMetaRow from '../NodeMetaRow'

const DEFAULT_COLOR = '#fffbe6'

/**
 * 备注节点 — 纯文本便签
 * - 浅黄色便签外观，颜色由 NodeToolbarPortal 提供的颜色选择器修改
 * - 无 Handle（不参与数据流）
 * - NodeResizer 支持拖拽调整大小
 * - 双击进入编辑模式（textarea），点击外部或按 Esc 退出
 * - 选中态操作栏（复制 / 删除 / 颜色）由 NodeToolbarPortal 统一渲染
 */
function NoteNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef(null)
  const { updateNodeData } = useReactFlow()

  const text = data.text || ''
  const color = data.color || DEFAULT_COLOR

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation()
    setEditing(true)
  }, [])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      // 光标移到末尾
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  const handleTextChange = useCallback((e) => {
    updateNodeData(id, { text: e.target.value })
  }, [id, updateNodeData])

  const handleBlur = useCallback(() => {
    setEditing(false)
  }, [])

  const handleKeyDown = useCallback((e) => {
    // 阻止冒泡到 ReactFlow（否则会删除节点或触发快捷键）
    e.stopPropagation()
    // IME 组合输入期间不处理快捷键
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }, [])

  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      {/* 画布内序号角标 (NodeMetaRow seq-only, 无 name; seq 由 NodeMetaRow 内部 useNodeSeq 取) */}
      <NodeMetaRow nodeId={id} />

      <div
        className={`note-node ${selected ? 'selected' : ''}`}
        style={{ backgroundColor: color }}
        onDoubleClick={handleDoubleClick}
      >
        {/* 标题行 */}
        <div className="note-node-title">📌 备注</div>

        {/* 内容区域 */}
        {editing ? (
          <textarea
            ref={textareaRef}
            className="note-node-textarea"
            value={text}
            onChange={handleTextChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="输入备注..."
          />
        ) : (
          <div className="note-node-text">
            {text || <span className="renderer-placeholder">双击编辑备注...</span>}
          </div>
        )}
      </div>
    </>
  )
}

export default memo(NoteNode)
