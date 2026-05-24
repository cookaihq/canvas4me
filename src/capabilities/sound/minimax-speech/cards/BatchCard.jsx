import { memo } from 'react'
import FoldedAudioPreviewCard from '@/canvas/renderers/folded/FoldedAudioPreviewCard'
import { lookupVoiceName } from '../voice-presets'

/**
 * MiniMax Speech · batch mode 节点本体卡片 — 折叠形态(form 'folded')
 *
 * batch 模式与 quick 共用同一种产物渲染 (单段音频), 派生出来的每个节点也是 batch mode.
 * caption 与 quick 一致.
 */

function buildCaption({ modeParams }) {
  if (!modeParams) return ''
  const voiceName = lookupVoiceName(modeParams.voice_id) || 'Default Voice'
  const format = (modeParams.format || 'mp3').toUpperCase()
  const emotion = modeParams.emotion || 'auto'
  const emotionLabel = emotion.charAt(0).toUpperCase() + emotion.slice(1)
  return `${voiceName} · ${format} · ${emotionLabel}`
}

function MinimaxSpeechBatchCard({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedAudioPreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="输入多段文本后点击 Run, 按分隔符切分并发"
      buildCaption={buildCaption}
    />
  )
}

export default memo(MinimaxSpeechBatchCard)
