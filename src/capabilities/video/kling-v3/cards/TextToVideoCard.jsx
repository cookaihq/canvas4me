import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * 可灵 V3 · text-to-video mode 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 节点本体只渲染产物预览区. 4 态由 FoldedVideoPreviewCard 接管:
 *   Ready / Running / Done (<video> 循环预览) / Failed
 */
function TextToVideoCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="填写提示词后点击 Run"
    />
  )
}

export default memo(TextToVideoCard)
