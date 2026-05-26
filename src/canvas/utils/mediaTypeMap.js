/**
 * 把素材库的 media_type 映射到 input 节点的 subType。
 *
 * 独立模块：无 vite alias 依赖，可在 node:test 环境直接 import。
 *
 * 单测说明：测试只覆盖此映射函数，不测 buildMaterialNode 本体。
 * buildMaterialNode 间接依赖 @/canvas/icons（vite alias），node:test 无法解析。
 * 节点结构正确性由 createInputNode 自身负责（drop 链路天天验证）+ 手动验收兜底。
 *
 * @param {string} mediaType
 * @returns {'image'|'video'|'audio'|'text'|null}
 */
export function mapMediaTypeToSubType(mediaType) {
  if (mediaType === 'image') return 'image'
  if (mediaType === 'video') return 'video'
  if (mediaType === 'audio') return 'audio'
  if (mediaType === 'text') return 'text'
  return null
}
