import { memo } from 'react'
import FoldedImagePreviewCard from '@/canvas/renderers/folded/FoldedImagePreviewCard'

/**
 * Nano Banana 节点本体卡片 — 折叠形态
 * 只渲染产物预览区（Ready/Running/Done 单图或多图 N 宫格/Failed）。
 */
function NanoBananaCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedImagePreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="输入提示词后点击 Run"
    />
  )
}

export default memo(NanoBananaCard)
