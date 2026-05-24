import { useCallback, useMemo, useRef, useState } from 'react'
import { message } from 'antd'

import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import { SegmentControl } from '@/canvas/components/fields'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import useCapabilityCredits from '@/canvas/hooks/useCapabilityCredits'
import {
  MINIMAX_MUSIC_MODELS, DEFAULT_MODEL, DEFAULT_VOCAL_MODE,
  vocalModeOptions, STRUCTURE_TAGS,
  FORMAT_OPTIONS, SAMPLE_RATE_OPTIONS, BITRATE_OPTIONS, AUDIO_SETTING_DEFAULTS,
} from '../_shared/constants'
import '../_shared/minimax-music-docked.css'

/**
 * MiniMax Music · 单 mode 折叠 DockedPanel
 * variant 'default'(紧凑) / 'advanced'(齿轮展开 audio_setting) / 'modal'(描述放大)。
 * 人声段(纯器乐/自己写词/自动生成歌词)收口 is_instrumental/lyrics/lyrics_optimizer 三态。
 */
export default function MinimaxMusicDockedPanel({
  node, capability, mode, params, edges, nodes,
  isDone, paramsUnchanged = false, variant = 'default',
  onCapabilityChange, onModeChange, onParamsChange, onRun, onRequestVariant,
}) {
  const facade = useCanvasFacade()
  const lyricsRef = useRef(null)

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  const model = params.model || DEFAULT_MODEL
  const vocalMode = params.vocalMode || DEFAULT_VOCAL_MODE
  const vocalOptions = useMemo(() => vocalModeOptions(model), [model])

  // prompt 端口 ↔ params.prompt placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
    onChange: (val) => onParamsChange({ prompt: val }),
    nodeId: node.id, portId: 'prompt', edges,
  })
  // lyrics 端口 ↔ params.lyrics placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.lyrics || '',
    onChange: (val) => onParamsChange({ lyrics: val }),
    nodeId: node.id, portId: 'lyrics', edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id && e.targetHandle === 'prompt' && e.source === sourceNodeId
    )))
  }, [facade, node.id])

  const handleLyricsChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id && e.targetHandle === 'lyrics' && e.source === sourceNodeId
    )))
  }, [facade, node.id])

  const promptEdgeId = useMemo(() => {
    const e = edges.find(e => e.target === node.id && e.targetHandle === 'prompt')
    return e ? e.id : null
  }, [edges, node.id])

  // 切 model: v2.5「自动生成歌词」→ v2.6(不支持)时回落到「自己写词」
  const handleBottomParamsChange = useCallback((patch) => {
    if (patch.model === 'minimax-music-v2.6' && (params.vocalMode || DEFAULT_VOCAL_MODE) === 'auto') {
      onParamsChange({ ...patch, vocalMode: 'lyrics' })
      message.info('v2.6 不支持自动生成歌词，已切到「自己写词」')
    } else {
      onParamsChange(patch)
    }
  }, [params.vocalMode, onParamsChange])

  const [runCount, setRunCount] = useState(1)
  const collectedInputs = useMemo(() => ({}), [])  // pricing 不依赖端口值
  const { credits } = useCapabilityCredits(capability, mode, params, collectedInputs)

  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if ((params.prompt || '').trim() === '' && !promptEdgeId) {
      message.warning('请先填写音乐描述或连接 prompt 端口')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, params.prompt, promptEdgeId, onRun, runCount])

  const isModal = variant === 'modal'
  const showAdvanced = variant === 'advanced' || variant === 'modal'
  const audioSetting = params.audio_setting || {}
  const setAudio = (k, v) => onParamsChange({ audio_setting: { ...audioSetting, [k]: v } })

  return (
    <div className="docked-panel-body minimax-music-dp">
      <DockedTopBar
        capability={capability} mode={mode} variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* 音乐描述 */}
      <div className={`mm-prompt-wrap${isModal ? ' modal' : ''}`}>
        <TextInputWithEdges
          value={params.prompt || ''}
          onChange={(v) => onParamsChange({ prompt: v })}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          variant={isModal ? 'modal' : 'inline'}
          placeholder="描述你想要的音乐: 风格 / 情绪 / 乐器 / BPM…"
        />
      </div>

      {/* 人声 */}
      <SegmentControl
        label="人声"
        options={vocalOptions}
        value={vocalMode}
        onChange={(v) => onParamsChange({ vocalMode: v })}
        fill
      />

      {/* 歌词 — 仅「自己写词」展开 */}
      {vocalMode === 'lyrics' && (
        <div className="mm-lyrics-wrap">
          <div className="mm-tag-row" aria-label="结构标签快捷插入">
            {STRUCTURE_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                className="mm-tag-chip"
                onClick={() => lyricsRef.current?.insertText(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <TextInputWithEdges
            ref={lyricsRef}
            value={params.lyrics || ''}
            onChange={(v) => onParamsChange({ lyrics: v })}
            nodes={nodes}
            onChipDelete={handleLyricsChipDelete}
            variant="inline"
            placeholder="歌词（选填）；点上方标签插入结构…"
          />
        </div>
      )}

      {/* 底栏: 模型 chip + 高级齿轮 + 积分 + Run + ×N */}
      <DockedBottomBar
        capability={capability} mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={handleBottomParamsChange}
        extraOptions={{ model: { options: MINIMAX_MUSIC_MODELS } }}
        variant={variant} isDone={isDone} paramsUnchanged={paramsUnchanged}
        runCount={runCount} onRunCountChange={setRunCount}
        credits={credits} onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
        showAdvancedGear={true}
      />

      {/* 高级区: audio_setting —— 底栏下方 */}
      {showAdvanced && (
        <div className="mm-advanced-region" aria-label="输出格式高级区">
          <SegmentControl
            label="格式 format" options={FORMAT_OPTIONS}
            value={audioSetting.format ?? AUDIO_SETTING_DEFAULTS.format}
            onChange={(v) => setAudio('format', v)} fill
          />
          <SegmentControl
            label="采样率 (Hz)" options={SAMPLE_RATE_OPTIONS}
            value={audioSetting.sample_rate ?? AUDIO_SETTING_DEFAULTS.sample_rate}
            onChange={(v) => setAudio('sample_rate', v)} fill
          />
          <SegmentControl
            label="码率 (bps)" options={BITRATE_OPTIONS}
            value={audioSetting.bitrate ?? AUDIO_SETTING_DEFAULTS.bitrate}
            onChange={(v) => setAudio('bitrate', v)} fill
          />
        </div>
      )}
    </div>
  )
}
