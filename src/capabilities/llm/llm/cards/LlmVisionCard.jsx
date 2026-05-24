import { memo } from 'react'
import LlmFoldedCard from './_shared'

function LlmVisionCard({ nodeId, data, downstreamOutputNode }) {
  return <LlmFoldedCard nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} modeLabel="图像理解" />
}

export default memo(LlmVisionCard)
