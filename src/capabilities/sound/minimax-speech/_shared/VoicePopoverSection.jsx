import { useEffect, useRef, useState } from 'react'

import { ArrowLeftRight, PlayCircle, PauseCircle } from '@/canvas/icons'
import { lookupVoiceName, LANGUAGE_OPTIONS } from '../voice-presets'
import VoicePickerModal from './VoicePickerModal'

/**
 * VOICE 段 (popover 内)
 *
 * 视觉: 音色卡 (cover/试听按钮 + 名称 + meta chips + 右侧切换图标)
 * 点击切换图标 → 弹二级 VoicePickerModal (搜索 / 分组 / 试听)
 *
 * 展示名优先级:
 *   1. voiceName prop (来自 modeParams.voice_name, 包含扩展预设/克隆音色的真实名称)
 *   2. lookupVoiceName(value) (17 项硬编码通用预设)
 *   3. value (voice_id) 兜底
 *
 * voiceMeta (来自 modeParams.voice_meta) 用于:
 *   - 行 2 多 chip 展示 (language/accent/gender/age/tag_list), 缺字段不显示对应 chip
 *   - 左侧 cover 区: 有 sample_audio 时显示播放按钮, 点击试听; 无则显示默认 mic icon
 *
 * onChange 回传 { voice_id, voice_name, voice_meta } 对象, 由调用方写入 modeParams.
 * 同时兼容老调用方传 voice_id 字符串.
 */
export default function VoicePopoverSection({ value, voiceName: voiceNameProp, voiceMeta, language, onChange, projectId, nodeId }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  const voiceName = voiceNameProp || lookupVoiceName(value) || value || 'Default Voice'
  const langLabel = LANGUAGE_OPTIONS.find(l => l.value === language)?.label || language

  // 切换音色 (sample_audio 变化) 时停止当前试听
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlaying(false)
  }, [voiceMeta?.sample_audio])

  // unmount 时停止试听
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePlay = (e) => {
    e.stopPropagation()
    if (!voiceMeta?.sample_audio) return
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(voiceMeta.sample_audio)
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
    audioRef.current.currentTime = 0
    const p = audioRef.current.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => setPlaying(false))
    }
    setPlaying(true)
  }

  // 收集要显示的 meta chips: 缺字段就跳过
  const chips = []
  if (voiceMeta?.language) chips.push({ key: 'language', label: voiceMeta.language })
  if (voiceMeta?.accent) chips.push({ key: 'accent', label: voiceMeta.accent })
  if (voiceMeta?.gender) chips.push({ key: 'gender', label: voiceMeta.gender })
  if (voiceMeta?.age) chips.push({ key: 'age', label: voiceMeta.age })
  if (Array.isArray(voiceMeta?.tag_list)) {
    voiceMeta.tag_list.forEach((tag, i) => {
      if (tag) chips.push({ key: `tag-${i}-${tag}`, label: tag })
    })
  }

  // 老画布无 voice_meta 时, 行 2 回退到语言标签 (避免空白行)
  const showLegacyLang = chips.length === 0

  return (
    <div className="ms-dp-popover-section">
      <div className="ms-dp-popover-section-label">VOICE</div>
      <div className="ms-dp-voice-row">
        <div className="ms-dp-voice-cover">
          {voiceMeta?.sample_audio ? (
            <button
              type="button"
              className="ms-dp-voice-row-play"
              onClick={handlePlay}
              aria-label={playing ? '暂停试听' : '试听'}
              title={playing ? '暂停' : '试听'}
            >
              {playing ? <PauseCircle size={22} /> : <PlayCircle size={22} />}
            </button>
          ) : (
            <span aria-hidden="true">🎙️</span>
          )}
        </div>
        <div className="ms-dp-voice-info">
          <div className="ms-dp-voice-name" title={voiceName}>{voiceName}</div>
          {showLegacyLang ? (
            <div className="ms-dp-voice-lang">{langLabel || '—'}</div>
          ) : (
            <div className="ms-dp-voice-row-meta">
              {chips.map(c => (
                <span key={c.key} className="ms-dp-voice-meta-chip">{c.label}</span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ms-dp-voice-swap"
          onClick={() => setPickerOpen(true)}
          aria-label="切换音色"
        >
          <ArrowLeftRight size={14} />
        </button>
      </div>

      {pickerOpen && (
        <VoicePickerModal
          value={value}
          language={language}
          onClose={() => setPickerOpen(false)}
          onSelect={(voice) => {
            if (typeof voice === 'string') {
              // 兼容老调用方: 仅传 voice_id 字符串
              onChange?.({ voice_id: voice, voice_name: lookupVoiceName(voice) || voice, voice_meta: null })
            } else {
              // 新调用方: 完整 voice 对象, 把 voice_name + voice_meta 一并回传以便存入 modeParams
              onChange?.({
                voice_id: voice.voice_id,
                voice_name: voice.voice_name || voice.voice_id,
                voice_meta: {
                  language: voice.language || null,
                  accent: voice.accent || null,
                  gender: voice.gender || null,
                  age: voice.age || null,
                  tag_list: Array.isArray(voice.tag_list) ? voice.tag_list : null,
                  sample_audio: voice.sample_audio || null,
                },
              })
            }
            setPickerOpen(false)
          }}
          projectId={projectId}
          nodeId={nodeId}
        />
      )}
    </div>
  )
}
