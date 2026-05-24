import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * sync 节点本体卡片 — 折叠形态(form 'folded')
 */
function SyncCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传源视频和音频后点击 Run"
    />
  )
}

export default memo(SyncCard)
