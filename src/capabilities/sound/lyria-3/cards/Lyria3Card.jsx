import { memo } from 'react'
import FoldedAudioPreviewCard from '@/canvas/renderers/folded/FoldedAudioPreviewCard'
import { modelShortLabel, formatDuration } from '../_shared/constants'

/**
 * Lyria 3 · 折叠节点本体卡片（form 'folded'）。
 * caption: "{Clip|Pro} · {时长}"，例 "Clip · 0:30"；无时长时只显示 Clip/Pro。
 */
function buildCaption({ modeParams, content }) {
  const short = modelShortLabel(modeParams?.model)
  const dur = formatDuration(content?.duration)
  return dur ? `${short} · ${dur}` : short
}

function Lyria3Card({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedAudioPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="填写音乐描述后点击 Run"
      buildCaption={buildCaption}
    />
  )
}

export default memo(Lyria3Card)
