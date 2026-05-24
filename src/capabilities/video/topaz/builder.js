import {
  DEFAULT_ENHANCEMENT_MODEL,
  DEFAULT_UPSCALE_FACTOR,
  TOPAZ_ENHANCEMENT_MODELS,
  TOPAZ_MODEL,
} from './constants'

const ADVANCED_NUMBER_FIELDS = [
  'compression',
  'noise',
  'halo',
  'grain',
  'recover_detail',
]

export function buildTopazRequestBody({ modeParams = {}, collectedInputs = {}, canvasId, nodeId }) {
  const videoUrl = pickPortUrl(collectedInputs.video) || modeParams.video_url
  if (!videoUrl) {
    console.warn('[Topaz] missing input video before submit', buildMissingVideoDiagnostics({
      canvasId,
      nodeId,
      collectedInputs,
      modeParams,
      resolvedVideoUrl: videoUrl || null,
    }))
    throw new Error('请提供输入视频')
  }

  const enhancementModel = modeParams.enhancement_model || DEFAULT_ENHANCEMENT_MODEL
  if (!TOPAZ_ENHANCEMENT_MODELS.includes(enhancementModel)) {
    throw new Error('增强模型不在支持列表中')
  }

  const upscaleFactor = modeParams.upscale_factor ?? DEFAULT_UPSCALE_FACTOR
  if (!isNumberInRange(upscaleFactor, 1, 4)) {
    throw new Error('放大倍率需在 1-4 范围内')
  }

  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model: TOPAZ_MODEL,
    video_url: videoUrl,
    enhancement_model: enhancementModel,
    upscale_factor: upscaleFactor,
  }

  if (modeParams.target_fps != null) {
    const targetFps = Number(modeParams.target_fps)
    if (!Number.isInteger(targetFps) || targetFps < 16 || targetFps > 60) {
      throw new Error('目标帧率需在 16-60 范围内')
    }
    body.target_fps = targetFps
  }

  for (const field of ADVANCED_NUMBER_FIELDS) {
    const value = modeParams[field]
    if (value == null) continue
    const numberValue = Number(value)
    if (!isNumberInRange(numberValue, 0, 1)) {
      throw new Error(`${field} 需在 0-1 范围内`)
    }
    body[field] = numberValue
  }

  if (modeParams.h264_output === true) {
    body.h264_output = true
  }

  return { body, urlFields: ['video_url'] }
}

function buildMissingVideoDiagnostics({ canvasId, nodeId, collectedInputs, modeParams, resolvedVideoUrl }) {
  return {
    canvasId,
    nodeId,
    collectedInputKeys: Object.keys(collectedInputs || {}),
    modeParamsVideoUrlPresent: Boolean(modeParams?.video_url),
    resolvedVideoUrl,
    videoInput: summarizeInput(collectedInputs?.video),
  }
}

function summarizeInput(input) {
  if (!input) {
    return {
      present: false,
      itemCount: 0,
      items: [],
    }
  }

  const items = Array.isArray(input) ? input : [input]
  return {
    present: true,
    itemCount: items.length,
    items: items.map((item, index) => summarizeInputItem(item, index)),
  }
}

function summarizeInputItem(item, index) {
  const content = item?.content
  return {
    index,
    nodeId: item?.nodeId,
    subType: item?.subType,
    sourceHandle: item?.sourceHandle,
    label: item?.label,
    hasContent: Boolean(content),
    contentKeys: content ? Object.keys(content) : [],
    contentUrl: content?.url,
    flatUrl: item?.url,
    uploading: content?.uploading,
    fileName: content?.fileName,
  }
}

function pickPortUrl(input) {
  if (!input) return null
  const items = Array.isArray(input) ? input : [input]
  for (const item of items) {
    const url = item?.content?.url || item?.url
    if (url) {
      return url
    }
  }
  return null
}

function isNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
