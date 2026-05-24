/**
 * Nano Banana 结果解析 —— 见原型 §7 task.result / resolveContent
 *
 * result 兼容形态：
 *   已转存:     { images: [{ file_url, file_size, content_type, filename, origin_url }], text }
 *   未转存兜底: { results: [{ url, content_type }] }（上游原始返回）
 *
 * 返回 node.data.content：url(主预览=urls[0]) / urls(全部) / count / 第一张元数据 / images[]
 */
export function resolveNanoBananaContent(result) {
  if (!result || typeof result !== 'object') return null

  const rawImages = Array.isArray(result.images) ? result.images : []
  const firstImage = rawImages[0]

  if (firstImage?.file_url) {
    const images = rawImages.filter(img => img?.file_url).map(img => ({
      url: img.file_url, fileSize: img.file_size, mimeType: img.content_type, fileName: img.filename,
    }))
    return {
      url: images[0]?.url, fileSize: images[0]?.fileSize, mimeType: images[0]?.mimeType, fileName: images[0]?.fileName,
      urls: images.map(i => i.url), count: images.length, images,
    }
  }

  if (firstImage?.origin_url) {
    const images = rawImages.filter(img => img?.origin_url).map(img => ({ url: img.origin_url }))
    return { url: images[0]?.url, urls: images.map(i => i.url), count: images.length, images }
  }

  const results = Array.isArray(result.results) ? result.results : []
  if (results[0]?.url) {
    const images = results.filter(r => r?.url).map(r => ({ url: r.url, mimeType: r.content_type }))
    return { url: images[0]?.url, mimeType: images[0]?.mimeType, urls: images.map(i => i.url), count: images.length, images }
  }

  return null
}
