/**
 * MiniMax Speech 通用预设音色清单 — 17 项硬编码常量
 *
 * 来源: foxapi 官方文档 speech-2.8-hd.json 的 voice_id 字段示例枚举.
 * 上游官方未提供中文/英文展示名, 这里由前端自定 (可后续替换为 i18n key).
 *
 * 不包含 cover_url / sample_audio — UI 仅展示文字名, 不渲染封面/试听按钮.
 */

export const COMMON_VOICE_PRESETS = [
  { voice_id: 'Wise_Woman',          voice_name: 'Wise Woman' },
  { voice_id: 'Friendly_Person',     voice_name: 'Friendly Person' },
  { voice_id: 'Inspirational_girl',  voice_name: 'Inspirational Girl' },
  { voice_id: 'Deep_Voice_Man',      voice_name: 'Deep Voice Man' },
  { voice_id: 'Calm_Woman',          voice_name: 'Calm Woman' },
  { voice_id: 'Casual_Guy',          voice_name: 'Casual Guy' },
  { voice_id: 'Lively_Girl',         voice_name: 'Lively Girl' },
  { voice_id: 'Patient_Man',         voice_name: 'Patient Man' },
  { voice_id: 'Young_Knight',        voice_name: 'Young Knight' },
  { voice_id: 'Determined_Man',      voice_name: 'Determined Man' },
  { voice_id: 'Lovely_Girl',         voice_name: 'Lovely Girl' },
  { voice_id: 'Decent_Boy',          voice_name: 'Decent Boy' },
  { voice_id: 'Imposing_Manner',     voice_name: 'Imposing Manner' },
  { voice_id: 'Elegant_Man',         voice_name: 'Elegant Man' },
  { voice_id: 'Abbess',              voice_name: 'Abbess' },
  { voice_id: 'Sweet_Girl_2',        voice_name: 'Sweet Girl 2' },
  { voice_id: 'Exuberant_Girl',      voice_name: 'Exuberant Girl' },
]

export const DEFAULT_VOICE_ID = 'Wise_Woman'

/**
 * 通过 voice_id 反查展示名。
 * 优先通用预设, 找不到时返回原 voice_id (兼容扩展预设/克隆音色尚未拉到清单的场景).
 */
export function lookupVoiceName(voiceId, extendedPresets = []) {
  if (!voiceId) return ''
  const common = COMMON_VOICE_PRESETS.find(v => v.voice_id === voiceId)
  if (common) return common.voice_name
  const ext = extendedPresets.find(v => v?.voice_id === voiceId)
  if (ext?.voice_name) return ext.voice_name
  return voiceId
}

// ─── 语言清单 (41 项, 文档来源: foxapi speech-2.8-hd spec) ───

export const LANGUAGE_OPTIONS = [
  { value: 'Chinese',       label: '中文' },
  { value: 'Chinese,Yue',   label: '粤语' },
  { value: 'English',       label: 'English' },
  { value: 'Japanese',      label: '日本語' },
  { value: 'Korean',        label: '한국어' },
  { value: 'Spanish',       label: 'Español' },
  { value: 'French',        label: 'Français' },
  { value: 'German',        label: 'Deutsch' },
  { value: 'Russian',       label: 'Русский' },
  { value: 'Portuguese',    label: 'Português' },
  { value: 'Italian',       label: 'Italiano' },
  { value: 'Arabic',        label: 'العربية' },
  { value: 'Turkish',       label: 'Türkçe' },
  { value: 'Dutch',         label: 'Nederlands' },
  { value: 'Ukrainian',     label: 'Українська' },
  { value: 'Vietnamese',    label: 'Tiếng Việt' },
  { value: 'Indonesian',    label: 'Bahasa Indonesia' },
  { value: 'Thai',          label: 'ไทย' },
  { value: 'Polish',        label: 'Polski' },
  { value: 'Romanian',      label: 'Română' },
  { value: 'Greek',         label: 'Ελληνικά' },
  { value: 'Czech',         label: 'Čeština' },
  { value: 'Finnish',       label: 'Suomi' },
  { value: 'Hindi',         label: 'हिन्दी' },
  { value: 'Bulgarian',     label: 'Български' },
  { value: 'Danish',        label: 'Dansk' },
  { value: 'Hebrew',        label: 'עברית' },
  { value: 'Malay',         label: 'Bahasa Melayu' },
  { value: 'Persian',       label: 'فارسی' },
  { value: 'Slovak',        label: 'Slovenčina' },
  { value: 'Swedish',       label: 'Svenska' },
  { value: 'Croatian',      label: 'Hrvatski' },
  { value: 'Filipino',      label: 'Filipino' },
  { value: 'Hungarian',     label: 'Magyar' },
  { value: 'Norwegian',     label: 'Norsk' },
  { value: 'Slovenian',     label: 'Slovenščina' },
  { value: 'Catalan',       label: 'Català' },
  { value: 'Nynorsk',       label: 'Nynorsk' },
  { value: 'Tamil',         label: 'தமிழ்' },
  { value: 'Afrikaans',     label: 'Afrikaans' },
  { value: 'auto',          label: 'Auto' },
]

export const DEFAULT_LANGUAGE = 'Chinese'

// ─── 情绪清单 (1 伪 auto + 9 真 spec) ───
//
// auto 是前端伪选项: builder 必须把 emotion 字段从请求体中剔除, 不能传字符串 "auto".
// calm / fluent 仅 Replicate 路径支持, 前端不强约束, hover tooltip 提示.

export const EMOTION_AUTO = 'auto'

export const EMOTION_OPTIONS = [
  { value: 'auto',      label: 'Auto',      warn: false },
  { value: 'happy',     label: 'Happy',     warn: false },
  { value: 'sad',       label: 'Sad',       warn: false },
  { value: 'angry',     label: 'Angry',     warn: false },
  { value: 'fearful',   label: 'Fearful',   warn: false },
  { value: 'disgusted', label: 'Disgusted', warn: false },
  { value: 'surprised', label: 'Surprised', warn: false },
  { value: 'calm',      label: 'Calm',      warn: true, warnText: '仅部分渠道支持, 可能失败' },
  { value: 'fluent',    label: 'Fluent',    warn: true, warnText: '仅部分渠道支持, 可能失败' },
  { value: 'neutral',   label: 'Neutral',   warn: false },
]

// ─── 音频输出 ───

export const FORMAT_OPTIONS = [
  { value: 'mp3',  label: 'MP3' },
  { value: 'pcm',  label: 'PCM' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav',  label: 'WAV' },
]
export const DEFAULT_FORMAT = 'mp3'

export const SAMPLE_RATE_OPTIONS = [
  { value: 8000,  label: '8 kHz' },
  { value: 16000, label: '16 kHz' },
  { value: 22050, label: '22 kHz' },
  { value: 24000, label: '24 kHz' },
  { value: 32000, label: '32 kHz' },
  { value: 44100, label: '44 kHz' },
]
export const DEFAULT_SAMPLE_RATE = 32000

export const BITRATE_OPTIONS = [
  { value: 32000,  label: '32 kbps' },
  { value: 64000,  label: '64 kbps' },
  { value: 128000, label: '128 kbps' },
  { value: 256000, label: '256 kbps' },
]
export const DEFAULT_BITRATE = 128000

export const CHANNEL_OPTIONS = [
  { value: 1, label: '单声道' },
  { value: 2, label: '立体声' },
]
export const DEFAULT_CHANNEL = 1

// ─── 模型选项 ───

export const MODEL_OPTIONS = [
  { value: 'speech-2.8-hd',    label: 'speech-2.8-hd',    shortLabel: '2.8hd',    desc: '高质量' },
  { value: 'speech-2.8-turbo', label: 'speech-2.8-turbo', shortLabel: '2.8turbo', desc: '速度优先' },
]
export const DEFAULT_MODEL = 'speech-2.8-hd'

// ─── 分隔符 (batch only) ───

export const SEPARATOR_OPTIONS = [
  { value: 'newline',        label: '换行',     desc: '\\n' },
  { value: 'double_newline', label: '双换行',   desc: '\\n\\n' },
  { value: 'dash',           label: '---',      desc: '\\n---\\n' },
  { value: 'equals',         label: '===',      desc: '\\n===\\n' },
]
export const DEFAULT_SEPARATOR = 'double_newline'

/**
 * 按分隔符切分大段文本.
 * 切分后 trim + 过滤空段.
 *
 * @param {string} text
 * @param {string} separator   one of 'newline' / 'double_newline' / 'dash' / 'equals'
 * @returns {string[]}         非空段数组
 */
export function splitPromptBySeparator(text, separator) {
  if (typeof text !== 'string' || !text.trim()) return []
  let parts
  switch (separator) {
    case 'newline':
      parts = text.split(/\n/)
      break
    case 'dash':
      parts = text.split(/(?:^|\n)---(?:\n|$)/)
      break
    case 'equals':
      parts = text.split(/(?:^|\n)===(?:\n|$)/)
      break
    case 'double_newline':
    default:
      parts = text.split(/\n{2,}/)
      break
  }
  return parts.map(s => s.trim()).filter(Boolean)
}

// ─── 字符上限 ───

export const MAX_PROMPT_LENGTH = 10000

// ─── 语速 ───

export const SPEED_MIN = 0.5
export const SPEED_MAX = 2.0
export const SPEED_STEP = 0.1
export const DEFAULT_SPEED = 1.0

// ─── 变声 (voice_modify) ───

export const VOICE_MODIFY_DEFAULT = { pitch: 0, intensity: 0, timbre: 0 }
export const VOICE_MODIFY_MIN = -100
export const VOICE_MODIFY_MAX = 100

export function isVoiceModifyDefault(vm) {
  if (!vm || typeof vm !== 'object') return true
  return (vm.pitch ?? 0) === 0 && (vm.intensity ?? 0) === 0 && (vm.timbre ?? 0) === 0
}

// ─── 发音字典 ───

export const PRONUNCIATION_DICT_DEFAULT = { tone_list: [] }

export function isPronunciationDictDefault(pd) {
  if (!pd || typeof pd !== 'object') return true
  const list = pd.tone_list
  return !Array.isArray(list) || list.length === 0
}
