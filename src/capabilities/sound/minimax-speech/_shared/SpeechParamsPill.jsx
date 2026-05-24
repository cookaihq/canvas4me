import { useState } from 'react'
import { Popover } from 'antd'

import { ChevronDown, ChevronUp } from '@/canvas/icons'
import {
  MODEL_OPTIONS,
  DEFAULT_MODEL,
  LANGUAGE_OPTIONS,
  lookupVoiceName,
  EMOTION_OPTIONS,
  DEFAULT_SPEED,
  DEFAULT_LANGUAGE,
  EMOTION_AUTO,
  DEFAULT_VOICE_ID,
} from '../voice-presets'
import ModelPopoverSection from './ModelPopoverSection'
import VoicePopoverSection from './VoicePopoverSection'
import LanguagePopoverSection from './LanguagePopoverSection'
import EmotionPopoverSection from './EmotionPopoverSection'
import SpeedPopoverSection from './SpeedPopoverSection'

/**
 * 自定义参数胶囊 (替代通用 ParamChip) — 见 docs/capabilities/sound/minimax-speech.md
 *
 * 显示: 2.8hd · Chinese · Auto · 1.0× · Wise Woman ▾
 * 点击弹 popover, 5 段竖排: MODEL / VOICE / LANGUAGE / EMOTION / SPEED
 */
export default function SpeechParamsPill({ params, onParamsChange, projectId, nodeId }) {
  const [open, setOpen] = useState(false)

  const model = params.model || DEFAULT_MODEL
  const voiceId = params.voice_id || DEFAULT_VOICE_ID
  const language = params.language_boost || DEFAULT_LANGUAGE
  const emotion = params.emotion || EMOTION_AUTO
  const speed = typeof params.speed === 'number' ? params.speed : DEFAULT_SPEED

  const modelOpt = MODEL_OPTIONS.find(m => m.value === model)
  const modelShort = modelOpt?.shortLabel || modelOpt?.label || model
  // 展示名优先级: modeParams.voice_name → 17 项硬编码 lookup → voice_id 兜底
  // 老画布缺 voice_name 时回退到 lookup/voice_id, 用户重选一次后即可显示真实名称
  const voiceName = params.voice_name || lookupVoiceName(voiceId) || voiceId
  const langLabel = LANGUAGE_OPTIONS.find(l => l.value === language)?.label || language
  const emotionLabel = EMOTION_OPTIONS.find(e => e.value === emotion)?.label || emotion
  const speedLabel = `${speed.toFixed(1)}×`

  const popoverContent = (
    <div className="ms-dp-popover-body" onWheel={(e) => e.stopPropagation()}>
      <ModelPopoverSection
        value={model}
        onChange={(next) => onParamsChange?.({ model: next })}
      />
      <VoicePopoverSection
        value={voiceId}
        voiceName={params.voice_name}
        voiceMeta={params.voice_meta}
        language={language}
        onChange={(next) => onParamsChange?.(next)}
        projectId={projectId}
        nodeId={nodeId}
      />
      <LanguagePopoverSection
        value={language}
        onChange={(next) => onParamsChange?.({ language_boost: next })}
      />
      <EmotionPopoverSection
        value={emotion}
        onChange={(next) => onParamsChange?.({ emotion: next })}
      />
      <SpeedPopoverSection
        value={speed}
        onChange={(next) => onParamsChange?.({ speed: next })}
      />
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      content={popoverContent}
      overlayClassName="ms-dp-popover"
      destroyOnHidden
      arrow
    >
      <button type="button" className={`ms-dp-pill nodrag${open ? ' open' : ''}`}>
        <span className="ms-dp-pill-text">
          <span className="ms-dp-pill-seg ms-dp-pill-seg-model">{modelShort}</span>
          <span className="ms-dp-pill-sep"> · </span>
          <span className="ms-dp-pill-seg">{langLabel}</span>
          <span className="ms-dp-pill-sep"> · </span>
          <span className="ms-dp-pill-seg">{emotionLabel}</span>
          <span className="ms-dp-pill-sep"> · </span>
          <span className="ms-dp-pill-seg">{speedLabel}</span>
          <span className="ms-dp-pill-sep"> · </span>
          <span className="ms-dp-pill-seg">{voiceName}</span>
        </span>
        <span className="ms-dp-pill-caret">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
    </Popover>
  )
}
