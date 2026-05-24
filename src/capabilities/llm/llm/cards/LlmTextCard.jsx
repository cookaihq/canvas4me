import { memo } from 'react'
import LlmFoldedCard from './_shared'

function LlmTextCard({ nodeId, data, downstreamOutputNode }) {
  return <LlmFoldedCard nodeId={nodeId} data={data} downstreamOutputNode={downstreamOutputNode} modeLabel="文本对话" />
}

export default memo(LlmTextCard)
