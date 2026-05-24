/**
 * 内容渲染器注册表
 *
 * 查找逻辑（优先级）：
 * 1. node.data.renderer 精确匹配 → RENDERER_OVERRIDES
 * 2. node.data.subType 匹配 → 如 'image' → ImageRenderer
 * 3. fallback → JsonRenderer
 */

import TextRenderer from '../renderers/content/TextRenderer'
import ImageRenderer from '../renderers/content/ImageRenderer'
import AudioRenderer from '../renderers/content/AudioRenderer'
import VideoRenderer from '../renderers/content/VideoRenderer'
import FileRenderer from '../renderers/content/FileRenderer'
import JsonRenderer from '../renderers/content/JsonRenderer'

// subType → 渲染器组件
export const CONTENT_RENDERERS = {
  'text': TextRenderer,
  'image': ImageRenderer,
  'audio': AudioRenderer,
  'video': VideoRenderer,
  'file': FileRenderer,
  'json': JsonRenderer,
}

// renderer 精确匹配 → 渲染器组件（优先级高于 subType）
export const RENDERER_OVERRIDES = {}

/**
 * 根据节点 data 查找渲染器组件
 */
export function getContentRenderer(data) {
  if (data.renderer && RENDERER_OVERRIDES[data.renderer]) {
    return RENDERER_OVERRIDES[data.renderer]
  }
  return CONTENT_RENDERERS[data.subType] || JsonRenderer
}
