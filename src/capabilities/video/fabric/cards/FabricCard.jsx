import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * fabric 节点本体卡片 — 折叠形态(form 'folded')
 * 节点本体只渲染产物预览;4 态由 FoldedVideoPreviewCard 接管。
 */
function FabricCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传人物图和音频后点击 Run"
    />
  )
}

export default memo(FabricCard)
