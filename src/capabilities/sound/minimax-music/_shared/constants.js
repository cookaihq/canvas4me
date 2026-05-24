/**
 * MiniMax Music 常量。
 * v2.6 / v2.5 共享绝大多数字段, 差异仅 lyrics_optimizer(v2.5 独有) 与 prompt/lyrics 长度上限。
 */
export const DEFAULT_MODEL = 'minimax-music-v2.6'

// 底栏「模型」chip 选项 —— 形状对齐 ModelParamSelector(value/label/description)。
// 不带 badge: 两档无 preview/pro 语义, 避免误导性图标。
export const MINIMAX_MUSIC_MODELS = [
  { value: 'minimax-music-v2.6', label: 'MiniMax Music v2.6', description: '最新版 · 描述 10-300 字' },
  { value: 'minimax-music-v2.5', label: 'MiniMax Music v2.5', description: '稳定版 · 支持自动写词 · 描述 ≤2000 字' },
]

// 结构标签快捷插入(插到歌词框光标处)。取自 foxapi minimax-music 文档全集。
// 注: MiniMax 用空格写法 [Pre Chorus], 与 lyria-3 的连字符 [Pre-Chorus] 不同, 属各自上游约定, 勿对齐。
export const STRUCTURE_TAGS = [
  '[Intro]', '[Verse]', '[Pre Chorus]', '[Chorus]', '[Bridge]',
  '[Outro]', '[Hook]', '[Interlude]', '[Solo]', '[Inst]',
]

// 人声维度(互斥三态): 纯器乐 / 自己写词 / 自动生成歌词(仅 minimax-music-v2.5 支持)。
export const DEFAULT_VOCAL_MODE = 'instrumental'
export function vocalModeOptions(model) {
  const supportsAuto = model === 'minimax-music-v2.5'
  return [
    { value: 'instrumental', label: '纯器乐' },
    { value: 'lyrics', label: '自己写词' },
    { value: 'auto', label: '自动生成歌词', badge: 'v2.5', disabled: !supportsAuto },
  ]
}

// audio_setting: 子字段默认值(builder 只发送非默认子字段)。
export const AUDIO_SETTING_DEFAULTS = { sample_rate: 44100, bitrate: 256000, format: 'mp3' }
export const FORMAT_OPTIONS = [
  { label: 'mp3', value: 'mp3' }, { label: 'wav', value: 'wav' }, { label: 'pcm', value: 'pcm' },
]
export const SAMPLE_RATE_OPTIONS = [16000, 24000, 32000, 44100].map(v => ({ label: String(v), value: v }))
export const BITRATE_OPTIONS = [32000, 64000, 128000, 256000].map(v => ({ label: String(v), value: v }))

export function modelShortLabel(model) {
  return String(model || '').includes('v2.5') ? 'v2.5' : 'v2.6'
}

export function vocalLabel(vocalMode) {
  return vocalMode === 'instrumental' ? '纯器乐' : '含人声'
}

export function formatDuration(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
