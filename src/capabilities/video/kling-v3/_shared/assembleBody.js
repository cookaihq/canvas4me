// _shared/assembleBody.js
import { resolveModelForMode } from './models.js'

const AUDIO_MODES = new Set(['text-to-video', 'image-to-video', 'first-last-frame'])

function put(body, key, val) {
  if (val === undefined || val === null) return
  if (typeof val === 'string' && val.trim() === '') return
  if (Array.isArray(val) && val.length === 0) return
  body[key] = val
}

export function assembleKlingV3Body({ mode, projectId, nodeId, prompt, multiPrompt, urls = {}, modeParams = {} }) {
  const body = { project_id: projectId, node_id: nodeId, model: resolveModelForMode(mode) }

  // prompt ⊕ multi_prompt（动作控制不支持 multi_prompt）
  const supportsMulti = mode !== 'motion-control'
  if (supportsMulti && Array.isArray(multiPrompt) && multiPrompt.length > 0) {
    body.multi_prompt = multiPrompt
  } else {
    put(body, 'prompt', prompt)
  }

  // 各 mode 的 url 字段
  if (mode === 'image-to-video') {
    put(body, 'image_url', urls.image_url)
  } else if (mode === 'first-last-frame') {
    put(body, 'image_url', urls.image_url)
    put(body, 'image_tail_url', urls.image_tail_url)
  } else if (mode === 'motion-control') {
    put(body, 'image_url', urls.image_url)
    put(body, 'video_url', urls.video_url)
    put(body, 'mode', modeParams.mode)
    put(body, 'character_orientation', modeParams.character_orientation)
    put(body, 'keep_original_sound', modeParams.keep_original_sound)
    return body // 动作控制到此为止：无 resolution/duration/audio/aspect_ratio/negative_prompt/voice
  }

  // 文生/图生/首尾帧 公共
  if (mode === 'text-to-video') put(body, 'aspect_ratio', modeParams.aspect_ratio) // 仅文生有比例
  put(body, 'resolution', modeParams.resolution)
  put(body, 'duration', modeParams.duration)
  put(body, 'negative_prompt', modeParams.negative_prompt)
  if (modeParams.generate_audio === true) {
    body.generate_audio = true
    put(body, 'voice_ids', Array.isArray(modeParams.voice_ids) ? modeParams.voice_ids.slice(0, 2) : undefined)
  }
  return body
}
