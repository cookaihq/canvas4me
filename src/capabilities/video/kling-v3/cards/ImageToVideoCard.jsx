import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * 可灵 V3 · image-to-video mode 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 节点本体只渲染产物预览区. 4 态由 FoldedVideoPreviewCard 接管:
 *   Ready / Running / Done (<video> 循环预览) / Failed
 */
function ImageToVideoCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传起始图后点击 Run"
    />
  )
}

export default memo(ImageToVideoCard)
