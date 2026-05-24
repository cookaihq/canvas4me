import { memo } from 'react'
import FoldedAudioPreviewCard from '@/canvas/renderers/folded/FoldedAudioPreviewCard'
import { modelShortLabel, vocalLabel, formatDuration } from '../_shared/constants'

/**
 * MiniMax Music · 折叠节点本体卡片(form 'folded')。
 * caption: "{v2.6|v2.5} · {纯器乐|含人声} · {时长}", 例 "v2.6 · 含人声 · 1:34"。
 */
function buildCaption({ modeParams, content }) {
  const short = modelShortLabel(modeParams?.model)
  const vocal = vocalLabel(modeParams?.vocalMode || 'instrumental')
  const dur = formatDuration(content?.duration)
  return [short, vocal, dur].filter(Boolean).join(' · ')
}

function MinimaxMusicCard({ nodeId, data, downstreamOutputNode }) {
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

export default memo(MinimaxMusicCard)
