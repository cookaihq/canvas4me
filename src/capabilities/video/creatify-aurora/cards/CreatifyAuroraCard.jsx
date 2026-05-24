import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * Creatify Aurora 节点本体卡片 — 折叠形态(form 'folded')
 * 节点本体只渲染产物预览;4 态由 FoldedVideoPreviewCard 接管。
 */
function CreatifyAuroraCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="连接人物图和音频后点击 Run"
    />
  )
}

export default memo(CreatifyAuroraCard)
