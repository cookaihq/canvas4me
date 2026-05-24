// _shared/pricing.js
import { resolveModelForMode } from './models.js'

export function resolveKlingV3ModelId({ mode, modeParams = {} }) {
  const model = resolveModelForMode(mode)
  if (mode === 'motion-control') {
    return modeParams.mode === 'pro' ? `${model}[pro]` : model
  }
  const res = modeParams.resolution || '720p'
  const audio = modeParams.generate_audio === true
  const hasVoice = audio && Array.isArray(modeParams.voice_ids) && modeParams.voice_ids.length > 0
  const tier = hasVoice ? `${res}|voice` : audio ? `${res}|audio` : res
  return `${model}[${tier}]`
}

export function computeKlingV3Units({ mode, modeParams = {} }) {
  if (mode === 'motion-control') return null
  const d = modeParams.duration
  return typeof d === 'number' && d > 0 ? d : null
}
