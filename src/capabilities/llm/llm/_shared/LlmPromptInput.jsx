/**
 * LLM 用户提示词输入区(文本端口「连入 + 手输」兼容)。
 *
 * 数据形态: params.prompt 是 string,连入节点以 placeholder 内嵌:
 *   "请总结 {{ai-canvas:edge:node_3a2b}} 写 100 字"
 *
 * 标准: docs/ui-standards/components-canvas.html #text-input-with-edges
 *
 * - useEdgePlaceholderSync 自动跟 edges 同步 placeholder 集合
 * - TextInputWithEdges 把 placeholder 渲染成不可编辑的 chip + 接收用户输入
 * - chip × 点击 → onChipDelete → 删 edge (placeholder 由 hook 同步清掉)
 */
import { useCallback } from 'react'
import { useStore } from '@xyflow/react'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'

const PORT_ID = 'prompt'

export default function LlmPromptInput({
  variant,
  edges,
  nodeId,
  value,
  onChange,
  placeholder = '输入用户提示词...',
}) {
  const facade = useCanvasFacade()
  // 订阅 nodes (浅比较),保证源节点 content.text 变化时 chip 实时跟随
  const nodes = useStore(s => s.nodes)
  const isModal = variant === 'modal'

  useEdgePlaceholderSync({
    value,
    onChange,
    nodeId,
    portId: PORT_ID,
    edges,
  })

  const handleChipDelete = useCallback(
    (sourceNodeId) => {
      facade.batchUpdateEdges(eds =>
        eds.filter(e => !(
          e.target === nodeId &&
          e.targetHandle === PORT_ID &&
          e.source === sourceNodeId
        ))
      )
      // placeholder 会被 useEdgePlaceholderSync 在 edges 变化后自动清掉
    },
    [facade, nodeId]
  )

  return (
    <div className={`llm-dp-prompt-wrap${isModal ? ' modal' : ''}`}>
      <TextInputWithEdges
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        nodes={nodes}
        onChipDelete={handleChipDelete}
        variant={isModal ? 'modal' : 'inline'}
      />
    </div>
  )
}
