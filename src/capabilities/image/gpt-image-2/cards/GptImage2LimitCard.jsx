import { memo } from 'react'
import FoldedImagePreviewCard from '@/canvas/renderers/folded/FoldedImagePreviewCard'

/**
 * GPT Image 2 (精简版) 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 与完整版共享 FoldedImagePreviewCard, 没有差异化展示需求.
 */
function GptImage2LimitCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedImagePreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="连接提示词后点击 Run"
    />
  )
}

export default memo(GptImage2LimitCard)
