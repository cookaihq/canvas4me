import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * Seedance 2.0 · text-to-video mode 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 节点本体只渲染产物预览区. 4 态由 FoldedVideoPreviewCard 接管:
 *   Ready / Running / Done (<video> 循环预览) / Failed
 */
function Seedance2TextToVideoCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="输入 prompt 后点击 Run"
    />
  )
}

export default memo(Seedance2TextToVideoCard)
