/**
 * GPT Image 2 结果解析 —— 见 docs/capabilities/image/gpt-image-2.md §4
 *
 * result 兼容形态:
 *   已转存:        { images: [{ file_url, file_size, content_type, filename, origin_url }], text }
 *   未转存兜底:    { results: [{ url, content_type }] }
 *
 * 返回 node.data.content:
 *   - url: 主预览 (urls[0])
 *   - urls: 全部 url 列表
 *   - count: 图片数
 *   - fileSize / mimeType / fileName: 第一张的元数据 (向后兼容单图节点)
 *   - images: 每张图的完整元数据 [{ url, fileSize, mimeType, fileName }],
 *     供 polling onSuccess 按 slotIndex 分发到 num_outputs > 1 拆出的多个节点
 */
export function resolveGptImage2Content(result) {
  if (!result || typeof result !== 'object') return null

  const rawImages = Array.isArray(result.images) ? result.images : []
  const firstImage = rawImages[0]

  if (firstImage?.file_url) {
    const images = rawImages
      .filter(img => img?.file_url)
      .map(img => ({
        url: img.file_url,
        fileSize: img.file_size,
        mimeType: img.content_type,
        fileName: img.filename,
      }))
    return {
      url: images[0]?.url,
      fileSize: images[0]?.fileSize,
      mimeType: images[0]?.mimeType,
      fileName: images[0]?.fileName,
      urls: images.map(img => img.url),
      count: images.length,
      images,
    }
  }

  if (firstImage?.origin_url) {
    const images = rawImages
      .filter(img => img?.origin_url)
      .map(img => ({ url: img.origin_url }))
    return {
      url: images[0]?.url,
      urls: images.map(img => img.url),
      count: images.length,
      images,
    }
  }

  const results = Array.isArray(result.results) ? result.results : []
  const firstResult = results[0]
  if (firstResult?.url) {
    const images = results
      .filter(r => r?.url)
      .map(r => ({
        url: r.url,
        mimeType: r.content_type,
      }))
    return {
      url: images[0]?.url,
      mimeType: images[0]?.mimeType,
      urls: images.map(img => img.url),
      count: images.length,
      images,
    }
  }

  return null
}
