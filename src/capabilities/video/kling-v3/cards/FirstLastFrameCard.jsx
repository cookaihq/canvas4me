import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * 可灵 V3 · first-last-frame mode 节点本体卡片 — 折叠形态(form 'folded')
 */
function FirstLastFrameCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传起始图 + 末帧后点击 Run"
    />
  )
}

export default memo(FirstLastFrameCard)
