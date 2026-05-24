import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * Seedance 2.0 · first-last-frame mode 节点本体卡片 — 折叠形态(form 'folded')
 */
function Seedance2FirstLastFrameCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传首帧和尾帧后点击 Run"
    />
  )
}

export default memo(Seedance2FirstLastFrameCard)
