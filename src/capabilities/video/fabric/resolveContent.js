/**
 * fabric 结果解析 —— 见 docs/capabilities/video/talking-head.md §5 / §6
 *
 * 兼容两种形态:
 *
 * 1) 后端已转存 (fabric + sync 两系列共享同一份):
 *    {
 *      kind: "video",
 *      video_url: "<OSS or origin URL>",     // OSS 已转存则是 OSS, 否则是上游原 URL
 *      origin_video_url: "<upstream URL>",   // 上游原始返回
 *      videos: [{
 *        file_url, origin_url, oss_object_key, file_size, content_type, filename
 *      }]
 *    }
 *
 * 2) 上游裸响应 (foxapi normalizeTaskStatus 包成 result.results[]):
 *    { results: [{ url, content_type? }] }   ← foxapi /v1/videos/generations 完成后的 url 24h 失效
 *
 * 返回 node.data.content:
 *   { url, fileSize, mimeType, fileName }
 *   优先用 videos[0].file_url (OSS 转存优先); fallback 顺序: video_url → origin_video_url → results[0].url
 */
export function resolveFabricContent(result) {
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
