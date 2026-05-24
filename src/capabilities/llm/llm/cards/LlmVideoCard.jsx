import { memo } from 'react'
import LlmFoldedCard from './_shared'

function LlmVideoCard({ nodeId, data, downstreamOutputNode }) {
  return <LlmFoldedCard nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} modeLabel="视频理解" />
}

export default memo(LlmVideoCard)
