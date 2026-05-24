import { memo } from 'react'
import LlmFoldedCard from './_shared'

function LlmAudioCard({ nodeId, data, downstreamOutputNode }) {
  return <LlmFoldedCard nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} modeLabel="音频理解" />
}

export default memo(LlmAudioCard)
