import {
  isFoldedCapability,
  isOutputNodeType,
  getCapabilityPrimaryOutput,
  resolveModeId,
} from '../../registry/nodeTypes'

/**
 * 解析节点的媒体产物 — 返回 { url, mediaType, nodeName, fileName } 或 null
 *
 * 用于"媒体选中态工具栏"(MediaPreviewToolbar)和"加入素材库"按钮的可见性 + 数据源.
 *
 * 三种来源:
 *   1. content/output 节点 (input / output-*): 直接读 data.content.url
 *   2. 折叠态媒体能力节点 (capability + isFoldedCapability): 沿出边找下游 outputNode 的 content.url
 *   3. 其余 (capability text/json 输出 / note 等): 返回 null
 *
 * 识别 image / video / audio. text/file 等非媒体子类型返回 null.
 *
 * @param {object} node 当前节点
 * @param {Map<string, object>} nodeById id → node 索引(用于沿边查找下游 output)
 * @param {Array<object>} edges 所有边
 * @returns {{ url:string, mediaType:'image'|'video'|'audio', nodeName?:string, fileName?:string } | null}
 */
export function resolveMediaContext(node, nodeById, edges) {
  if (!node) return null
  const data = node.data || {}

  // 1. 独立 outputNode (separated 形态; 折叠态被渲染层过滤)
  if (isOutputNodeType(node.type)) {
    const url = data.content?.url
    if (!url) return null
    const mediaType = guessMediaType(url, data.content?.mimeType)
    if (!mediaType) return null
    return {
      url,
      mediaType,
      nodeName: data.name,
      fileName: data.content?.fileName,
    }
  }

  // 2. 普通 content 节点 (InputNode): 直接读 data.content.url
  const directUrl = data.content?.url
  if (directUrl) {
    const mediaType = guessMediaType(directUrl, data.content?.mimeType, data.subType)
    if (!mediaType) return null
    return {
      url: directUrl,
      mediaType,
      nodeName: data.name,
      fileName: data.content?.fileName,
    }
  }

  // 3. 折叠态媒体能力节点: 找下游 outputNode 拿产物
  if (data.capability && isFoldedCapability(data.capability)) {
    const modeId = resolveModeId(data.capability, data.mode)
    const primaryOutput = getCapabilityPrimaryOutput(data.capability, modeId)
    const outputType = primaryOutput?.type
    if (outputType !== 'image' && outputType !== 'video' && outputType !== 'audio') return null

    for (const e of edges) {
      if (e.source !== node.id) continue
      const target = nodeById.get(e.target)
      if (!target || !isOutputNodeType(target.type)) continue
      const url = target.data?.content?.url
      if (!url) continue
      return {
        url,
        mediaType: outputType,
        nodeName: data.name,
        fileName: target.data?.content?.fileName,
      }
    }
  }

  return null
}

/**
 * 推断媒体类型 (image / video / audio). 不识别返回 null.
 */
export function guessMediaType(url, mimeType, subType) {
  if (subType === 'image') return 'image'
  if (subType === 'video') return 'video'
  if (subType === 'audio') return 'audio'
  if (typeof mimeType === 'string') {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('audio/')) return 'audio'
  }
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(url || '')
  const ext = m?.[1]?.toLowerCase()
  if (ext && /^(png|jpe?g|webp|gif|bmp|svg|heic|avif)$/.test(ext)) return 'image'
  if (ext && /^(mp4|mov|webm|m4v|mkv)$/.test(ext)) return 'video'
  if (ext && /^(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(ext)) return 'audio'
  return null
}
