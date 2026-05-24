/**
 * GPT Image 2 builder —— 见 docs/capabilities/image/gpt-image-2.md §3
 *
 * 后端 schema 对 model 单独开"严格 schema"（`extra="forbid"`），只接受 API 文档
 * 列出的字段：
 *   - 完整版 `gpt-image-2`:
 *     model, prompt, num_outputs, image_urls, resolution, quality, output_format, background, mask_url
 *   - 精简版 `gpt-image-2-limit`:
 *     model, prompt, num_outputs, image_urls, resolution
 *   - envelope 级（接口 wrapper 接受）: project_id, node_id, extra_task_id
 *
 * ⚠️ 不能往 body 里塞 `capability` / `mode`（非 API 契约字段，会触发 400）。
 * `mode` 是前端 UI 概念（画布上"选哪个 Mode"），后端通过 `model` 即可分派；
 * URL 段已经携带了 capability（`/node/image/gpt-image-2/submit`）。
 *
 * 输入汇总规则：
 * - prompt: 端口 collectedInputs.prompt 优先，其次面板 modeParams.prompt
 * - image_urls: 全部来自端口连入 (multi), 上限 10 张
 *
 * 完整版分辨率合成规则：
 *   前端 UI 把 resolution 拆成 aspect_ratio + clarity 两个独立控件 (popover 联动),
 *   builder 在此处把它们合并成 body.resolution = {width, height} 对象 (后端接 object 形态)。
 *   合规校验在前端 UI 层 (popover disabled 态) 拦掉,builder 仅做兜底:算不出来时不传 resolution
 *   让后端用默认 1024x1024。
 */
import { computeResolution } from './_shared/resolutionMath'
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'
export const MAX_REFERENCE_IMAGES = 10

export function buildGptImage2RequestBody({ mode, modeParams, collectedInputs, canvasId, nodeId }) {
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model: mode, // mode id 直接等于上游 model id
  }

  // modeParams.prompt 是 string,可能含 {{ai-canvas:edge:N}} placeholder
  // (TextInputWithEdges / RichPromptEditor 内嵌 chip → 字面 placeholder),
  // 提交前 expand 成源节点的 content.text
  body.prompt = expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  const imageInputs = collectedInputs.image
  const edgeImages = Array.isArray(imageInputs) ? imageInputs : imageInputs ? [imageInputs] : []
  const edgeUrls = edgeImages.map(img => img.content?.url).filter(Boolean)

  body.image_urls = edgeUrls.slice(0, MAX_REFERENCE_IMAGES)

  if (mode === 'gpt-image-2') {
    if (modeParams.num_outputs != null) body.num_outputs = modeParams.num_outputs
    if (modeParams.quality) body.quality = modeParams.quality
    if (modeParams.output_format) body.output_format = modeParams.output_format
    if (modeParams.background) body.background = modeParams.background

    // aspect_ratio + clarity → {width, height} 自定义分辨率对象
    if (modeParams.aspect_ratio && modeParams.clarity) {
      const r = computeResolution(modeParams.aspect_ratio, modeParams.clarity)
      if (r.ok) {
        body.resolution = { width: r.width, height: r.height }
      }
      // 否则不传 resolution, 后端用默认 1024x1024
    }

    // mask: 端口连入优先, 面板直传 fallback
    const maskInput = collectedInputs.mask
    const maskFromPort = Array.isArray(maskInput) ? maskInput[0] : maskInput
    const maskUrl = maskFromPort?.content?.url || modeParams.mask_url
    if (maskUrl) body.mask_url = maskUrl
  } else if (mode === 'gpt-image-2-limit') {
    if (modeParams.resolution) body.resolution = modeParams.resolution
    // 精简版不传 num_outputs / quality / output_format / background
  }

  return { body, urlFields: ['image_urls', 'mask_url'] }
}
