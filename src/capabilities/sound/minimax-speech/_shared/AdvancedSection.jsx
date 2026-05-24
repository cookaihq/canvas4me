import { useState, useCallback } from 'react'
import { Select, Switch, Slider, Tooltip, Input } from 'antd'

import { ChevronDown, ChevronUp, Plus, X } from '@/canvas/icons'
import {
  FORMAT_OPTIONS,
  SAMPLE_RATE_OPTIONS,
  BITRATE_OPTIONS,
  CHANNEL_OPTIONS,
  VOICE_MODIFY_MIN, VOICE_MODIFY_MAX, VOICE_MODIFY_DEFAULT,
} from '../voice-presets'

/**
 * Advanced 区 — variant === 'advanced' 时显示在紧凑布局下方
 *
 * 包含字段:
 *   - 音频输出 (折叠子面板): format / sample_rate / bitrate / channel
 *   - 英文规范化: switch
 *   - 变声效果 (voice_modify): 三 slider 横向 row
 *   - 发音矫正字典 (pronunciation_dict): chips 列表 + 添加按钮
 */
export default function AdvancedSection({ params, onParamsChange }) {
  return (
    <div className="ms-dp-advanced">
      <div className="ms-dp-advanced-title">高级 (capability 私有参数)</div>

      <AudioOutputBlock params={params} onParamsChange={onParamsChange} />
      <EnglishNormalizationBlock params={params} onParamsChange={onParamsChange} />
      <VoiceModifyBlock params={params} onParamsChange={onParamsChange} />
      <PronunciationDictBlock params={params} onParamsChange={onParamsChange} />
    </div>
  )
}

// ─── 音频输出 (二级折叠) ───
function AudioOutputBlock({ params, onParamsChange }) {
  const [collapsed, setCollapsed] = useState(true)
  const format = params.format || 'mp3'
  const sampleRate = params.sample_rate || 32000
  const bitrate = params.bitrate || 128000
  const channel = params.channel || 1

  const bitrateDisabled = format !== 'mp3'

  const summary = `${format.toUpperCase()} · ${(sampleRate / 1000).toFixed(0)}kHz · ${(bitrate / 1000).toFixed(0)}kbps · ${channel === 2 ? '立体声' : '单声道'}`

  return (
    <div className="ms-dp-advanced-block">
      <button
        type="button"
        className="ms-dp-advanced-row ms-dp-advanced-row-toggle"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="ms-dp-advanced-row-label">🔊 音频输出</span>
        <span className="ms-dp-advanced-row-value">{summary}</span>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {!collapsed && (
        <div className="ms-dp-advanced-sub">
          <div className="ms-dp-advanced-sub-row">
            <span className="ms-dp-advanced-sub-label">输出格式</span>
            <Select
              size="small"
              value={format}
              onChange={v => onParamsChange?.({ format: v })}
              options={FORMAT_OPTIONS}
              style={{ width: 130 }}
              getPopupContainer={(t) => t.parentNode}
            />
          </div>
          <div className="ms-dp-advanced-sub-row">
            <span className="ms-dp-advanced-sub-label">采样率</span>
            <Select
              size="small"
              value={sampleRate}
              onChange={v => onParamsChange?.({ sample_rate: v })}
              options={SAMPLE_RATE_OPTIONS}
              style={{ width: 130 }}
              getPopupContainer={(t) => t.parentNode}
            />
          </div>
          <div className="ms-dp-advanced-sub-row">
            <span className="ms-dp-advanced-sub-label">码率</span>
            <Tooltip title={bitrateDisabled ? '仅 MP3 格式支持码率配置' : ''}>
              <Select
                size="small"
                value={bitrate}
                onChange={v => onParamsChange?.({ bitrate: v })}
                options={BITRATE_OPTIONS}
                style={{ width: 130 }}
                disabled={bitrateDisabled}
                getPopupContainer={(t) => t.parentNode}
              />
            </Tooltip>
          </div>
          <div className="ms-dp-advanced-sub-row">
            <span className="ms-dp-advanced-sub-label">声道</span>
            <Select
              size="small"
              value={channel}
              onChange={v => onParamsChange?.({ channel: v })}
              options={CHANNEL_OPTIONS}
              style={{ width: 130 }}
              getPopupContainer={(t) => t.parentNode}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 英文规范化 ───
function EnglishNormalizationBlock({ params, onParamsChange }) {
  return (
    <div className="ms-dp-advanced-block">
      <div className="ms-dp-advanced-row">
        <span className="ms-dp-advanced-row-label">英文规范化</span>
        <span className="ms-dp-advanced-row-desc">将英文数字 / 符号规范化朗读</span>
        <Switch
          size="small"
          checked={params.english_normalization === true}
          onChange={(v) => onParamsChange?.({ english_normalization: v })}
        />
      </div>
    </div>
  )
}

// ─── 变声 voice_modify ───
function VoiceModifyBlock({ params, onParamsChange }) {
  const vm = params.voice_modify || VOICE_MODIFY_DEFAULT
  const update = (key) => (next) => {
    onParamsChange?.({
      voice_modify: { ...VOICE_MODIFY_DEFAULT, ...vm, [key]: next },
    })
  }
  return (
    <div className="ms-dp-advanced-block">
      <div className="ms-dp-advanced-row-label-line">变声效果 (voice_modify)</div>
      <div className="ms-dp-advanced-vm-grid">
        <VMSliderRow label="音高" value={vm.pitch ?? 0}     onChange={update('pitch')} />
        <VMSliderRow label="强度" value={vm.intensity ?? 0} onChange={update('intensity')} />
        <VMSliderRow label="音色" value={vm.timbre ?? 0}    onChange={update('timbre')} />
      </div>
    </div>
  )
}

function VMSliderRow({ label, value, onChange }) {
  return (
    <div className="ms-dp-advanced-vm-row">
      <span className="ms-dp-advanced-vm-label">{label}</span>
      <Slider
        min={VOICE_MODIFY_MIN}
        max={VOICE_MODIFY_MAX}
        step={1}
        value={value}
        onChange={onChange}
        tooltip={{ formatter: (val) => `${val}` }}
        style={{ flex: 1 }}
      />
      <span className="ms-dp-advanced-vm-value">{value}</span>
    </div>
  )
}

// ─── 发音矫正字典 ───
function PronunciationDictBlock({ params, onParamsChange }) {
  const pd = params.pronunciation_dict || { tone_list: [] }
  const list = Array.isArray(pd.tone_list) ? pd.tone_list : []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const updateList = useCallback((next) => {
    onParamsChange?.({
      pronunciation_dict: { tone_list: next },
    })
  }, [onParamsChange])

  const commit = useCallback(() => {
    const s = draft.trim()
    if (!s) { setAdding(false); setDraft(''); return }
    if (!s.includes('/')) {
      // 简单校验: 必须包含 "/"
      return
    }
    updateList([...list, s])
    setDraft('')
    setAdding(false)
  }, [draft, list, updateList])

  return (
    <div className="ms-dp-advanced-block">
      <div className="ms-dp-advanced-row-label-line">发音矫正字典 (pronunciation_dict)</div>
      <div className="ms-dp-advanced-pron-chips">
        {list.map((entry, i) => (
          <span key={i} className="ms-dp-advanced-pron-chip">
            <span className="ms-dp-advanced-pron-chip-text">{entry}</span>
            <button
              type="button"
              className="ms-dp-advanced-pron-chip-x"
              onClick={() => updateList(list.filter((_, j) => j !== i))}
              aria-label="删除"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {adding ? (
          <Input
            size="small"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPressEnter={commit}
            onBlur={commit}
            placeholder="原文/替换发音"
            style={{ width: 160 }}
          />
        ) : (
          <button
            type="button"
            className="ms-dp-advanced-pron-add"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} /> 添加
          </button>
        )}
      </div>
      <div className="ms-dp-advanced-row-desc">例: <code>omg/oh my god</code> 或 <code>行/xíng</code></div>
    </div>
  )
}
