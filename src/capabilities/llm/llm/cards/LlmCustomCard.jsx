import { memo } from 'react'
import LlmFoldedCard from './_shared'

function LlmCustomCard({ nodeId, data, downstreamOutputNode }) {
  return <LlmFoldedCard nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} modeLabel="混合模式" />
}

export default memo(LlmCustomCard)
