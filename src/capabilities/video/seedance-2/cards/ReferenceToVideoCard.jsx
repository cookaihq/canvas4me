import { memo } from 'react'
import FoldedVideoPreviewCard from '@/canvas/renderers/folded/FoldedVideoPreviewCard'

/**
 * Seedance 2.0 · reference-to-video mode 节点本体卡片 — 折叠形态(form 'folded')
 */
function Seedance2ReferenceToVideoCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedVideoPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="上传参考素材并填 prompt 点击 Run"
    />
  )
}

export default memo(Seedance2ReferenceToVideoCard)
