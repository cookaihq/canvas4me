import { memo } from 'react'
import FoldedAudioPreviewCard from '@/canvas/renderers/folded/FoldedAudioPreviewCard'
import { lookupVoiceName } from '../voice-presets'

/**
 * MiniMax Speech · quick mode 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 节点本体只渲染产物预览区. 4 态由 FoldedAudioPreviewCard 接管.
 *
 * caption: "{voice_name} · {FORMAT} · {emotion}", 例 "Wise Woman · MP3 · Auto"
 */

function buildCaption({ modeParams }) {
  if (!modeParams) return ''
  const voiceName = lookupVoiceName(modeParams.voice_id) || 'Default Voice'
  const format = (modeParams.format || 'mp3').toUpperCase()
  const emotion = modeParams.emotion || 'auto'
  const emotionLabel = emotion.charAt(0).toUpperCase() + emotion.slice(1)
  return `${voiceName} · ${format} · ${emotionLabel}`
}

function MinimaxSpeechQuickCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedAudioPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="输入文本后点击 Run"
      buildCaption={buildCaption}
    />
  )
}

export default memo(MinimaxSpeechQuickCard)
