/**
 * Seedance 2.0 结果解析 —— 见 docs/capabilities/video/seedance-2.md §6 / API_REFERENCE
 *
 * 兼容两种形态 (跟 talking-head 一致):
 *
 * 1) 后端已转存:
 *    {
 *      kind: "video",
 *      video_url: "<OSS or origin>",
 *      origin_video_url: "<upstream>",
 *      seed,                                    // 实际使用的 seed (Auto 时回传具体整数)
 *      videos: [{
 *        file_url, origin_url, oss_object_key, file_size, content_type, filename
 *      }]
 *    }
 *
 * 2) 上游裸响应 (foxapi normalizeTaskStatus 包成 result.results[]):
 *    { results: [{ url, seed }] }    ← url 24h 失效 (前端立即转存)
 *
 * 返回 node.data.content:
 *   { url, fileSize, mimeType, fileName }
 *   优先用 videos[0].file_url (OSS 优先); fallback: video_url → origin_video_url → results[0].url
 */
export function resolveSeedance2Content(result) {
  if (!result || typeof result !== 'object') return null

  const videoItem = Array.isArray(result.videos) ? result.videos[0] : null

  if (videoItem?.file_url) {
    return {
      url: videoItem.file_url,
      fileSize: videoItem.file_size,
      mimeType: videoItem.content_type || 'video/mp4',
      fileName: videoItem.filename,
    }
  }

  if (videoItem?.origin_url) {
    return {
      url: videoItem.origin_url,
      mimeType: videoItem.content_type || 'video/mp4',
      fileName: videoItem.filename,
    }
  }

  if (typeof result.video_url === 'string' && result.video_url) {
    return { url: result.video_url, mimeType: 'video/mp4' }
  }

  if (typeof result.origin_video_url === 'string' && result.origin_video_url) {
    return { url: result.origin_video_url, mimeType: 'video/mp4' }
  }

  // 形态 2: 上游裸响应 (foxapi 包成 { results: [...] })
  const results = Array.isArray(result.results) ? result.results : []
  const first = results[0]
  if (first?.url) {
    return {
      url: first.url,
      mimeType: first.content_type || 'video/mp4',
      fileName: first.filename,
      fileSize: typeof first.file_size === 'number' ? first.file_size : undefined,
    }
  }

  return null
}
