/**
 * MiniMax Music builder —— 见原型「7 区 · Builder 白名单」。
 *
 * 请求体(服务端与 foxapi 字段一致, 无 transformBody):
 *   { project_id, node_id, model, prompt, [人声三选一], audio_setting? }
 *   - project_id / node_id: 服务端包装字段(直连 foxapi 时翻译层 strip)
 *   - model: minimax-music-v2.6 / minimax-music-v2.5
 *   - prompt: 端口 placeholder 展开后的文本
 *   - 人声段映射:
 *       instrumental → is_instrumental: true
 *       lyrics       → lyrics(端口/面板文本, trim 后非空才发)
 *       auto(仅 v2.5)→ lyrics_optimizer: true
 *   - audio_setting: 仅发送与默认值不同的子字段; 全默认则不发
 */
import {
  DEFAULT_MODEL, DEFAULT_VOCAL_MODE, AUDIO_SETTING_DEFAULTS,
} from './_shared/constants'
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'

function pickAudioSetting(as) {
  if (!as || typeof as !== 'object') return null
  const out = {}
  for (const k of ['sample_rate', 'bitrate', 'format']) {
    if (as[k] != null && as[k] !== AUDIO_SETTING_DEFAULTS[k]) out[k] = as[k]
  }
  return Object.keys(out).length ? out : null
}

export function buildMinimaxMusicRequestBody({ modeParams, collectedInputs, canvasId, nodeId }) {
  const model = modeParams.model || DEFAULT_MODEL
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model,
  }

  // prompt: 含 {{ai-canvas:edge:N}} placeholder, 提交前展开为源节点文本
  body.prompt = expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // 人声段映射(互斥三选一)
  const vocalMode = modeParams.vocalMode || DEFAULT_VOCAL_MODE
  if (vocalMode === 'instrumental') {
    body.is_instrumental = true
  } else if (vocalMode === 'auto' && model === 'minimax-music-v2.5') {
    body.lyrics_optimizer = true
  } else {
    // 'lyrics', 或 'auto' 落到不支持的 model(防御退化为自己写词)
    const lyrics = expandPromptPlaceholders(modeParams.lyrics || '', collectedInputs, 'lyrics').trim()
    if (lyrics) body.lyrics = lyrics
  }

  // audio_setting: 仅发非默认子字段
  const audioSetting = pickAudioSetting(modeParams.audio_setting)
  if (audioSetting) body.audio_setting = audioSetting

  return { body, urlFields: [] }
}
