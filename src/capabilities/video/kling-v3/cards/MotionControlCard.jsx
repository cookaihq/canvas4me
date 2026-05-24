import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * 可灵 V3 · motion-control mode 节点本体卡片 — 折叠形态(form 'folded')
 */
function MotionControlCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传人物图 + 动作参考视频后点击 Run"
    />
  )
}

export default memo(MotionControlCard)
