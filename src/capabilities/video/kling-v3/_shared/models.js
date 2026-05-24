// _shared/models.js
export const KLING_V3_MODELS = {
  'text-to-video': 'kling-v3-text-to-video',
  'image-to-video': 'kling-v3-image-to-video',
  'first-last-frame': 'kling-v3-image-to-video',
  'motion-control': 'kling-v3-motion-control',
}
export function resolveModelForMode(mode) {
  const model = KLING_V3_MODELS[mode]
  if (!model) throw new Error(`[kling-v3] unknown mode: ${mode}`)
  return model
}
