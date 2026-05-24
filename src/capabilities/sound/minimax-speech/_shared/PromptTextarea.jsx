import { useCallback } from 'react'
import { Tooltip } from 'antd'

import { Expand, Minimize2 } from '@/canvas/icons'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import { MAX_PROMPT_LENGTH } from '../voice-presets'

/**
 * Prompt 多行输入 — 支持 ↗ 放大 icon 切换 modal variant + 文本端口连入 chip
 *
 * 内部用 TextInputWithEdges (contenteditable + chip),
 * 外面挂 ↗ 放大按钮 + 字符计数 (跟旧 antd TextArea 视觉一致).
 *
 * Props:
 *   value, onChange
 *   nodes — React Flow 节点 (chip 渲染需要查源节点 text)
 *   onChipDelete(sid) — chip × 删除回调 (调用方调 setEdges 删 edge)
 *   variant: 'default' | 'advanced' | 'modal'  - 控制行高 (modal 铺满)
 *   onRequestVariant(variant) - 点 ↗ / ⤢ 时切换 panel variant
 *   placeholder
 */
export default function PromptTextarea({
  value = '',
  onChange,
  nodes,
  onChipDelete,
  variant = 'default',
  onRequestVariant,
  placeholder = '输入要合成的文本, 例如「大家好, 欢迎来到我们的产品发布会」。支持 <#x#> 停顿与 (laughs) 等语气词…',
}) {
  const isModal = variant === 'modal'

  const handleChange = useCallback((next) => {
    if (typeof next !== 'string') return
    if (next.length > MAX_PROMPT_LENGTH) {
      onChange?.(next.slice(0, MAX_PROMPT_LENGTH))
      return
    }
    onChange?.(next)
  }, [onChange])

  const handleExpandClick = useCallback((e) => {
    e.stopPropagation()
    onRequestVariant?.(isModal ? 'default' : 'modal')
  }, [isModal, onRequestVariant])

  const charCount = value?.length ?? 0
  const overLimit = charCount > MAX_PROMPT_LENGTH

  return (
    <div className="ms-dp-prompt-wrap">
      <TextInputWithEdges
        value={value}
        onChange={handleChange}
        nodes={nodes}
        onChipDelete={onChipDelete}
        placeholder={placeholder}
        variant={isModal ? 'modal' : 'inline'}
      />
      <Tooltip title={isModal ? '缩小' : '放大输入'}>
        <button
          type="button"
          className="ms-dp-prompt-expand-btn nodrag"
          onClick={handleExpandClick}
          aria-label={isModal ? '缩小' : '放大输入'}
        >
          {isModal ? <Minimize2 size={14} /> : <Expand size={14} />}
        </button>
      </Tooltip>
      <div className={`ms-dp-prompt-counter${overLimit ? ' over' : ''}`}>
        {charCount} / {MAX_PROMPT_LENGTH}
      </div>
    </div>
  )
}
