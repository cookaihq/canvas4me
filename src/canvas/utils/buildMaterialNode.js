import { createInputNode } from './nodeFactory'
import { mapMediaTypeToSubType } from './mediaTypeMap'

/**
 * 根据素材 payload 构造一个待加入画布的 input 节点。
 *
 * 不持有副作用，调用方自己 setNodes(prev => [...prev, node])。
 * 支持调用源：drop 链路 + 素材预览 Modal。
 *
 * @param {object} material  {media_type, url, name, file_ext}
 * @param {{ x: number, y: number }} position  flow 坐标系下的目标位置
 * @returns {object|null} 节点对象，类型/url 不合法时返回 null
 */
export function buildMaterialNode(material, position) {
  const { media_type, url, name, file_ext } = material || {}
  const subType = mapMediaTypeToSubType(media_type)
  if (!subType || !url) return null
  return createInputNode(subType, position, {
    label: name || undefined,
    name: name || undefined,
    content: {
      url,
      fileName: name || `material${file_ext ? '.' + file_ext : ''}`,
    },
  })
}
