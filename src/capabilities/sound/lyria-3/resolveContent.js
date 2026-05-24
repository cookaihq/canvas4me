/**
 * Lyria 3 结果解析 —— 兼容两种终态形态:
 *  1) 服务端已转存: { audio_url, origin_audio_url, oss_object_key, file_size, content_type, filename, duration }
 *  2) foxapi 裸响应包装: { results: [{ url, content_type? }] }（url 24h 失效）
 *
 * 返回 node.data.content: { url, mimeType?, fileName?, fileSize?, duration?, ossObjectKey? }
 */
export function resolveLyria3Content(result) {
  if (!result || typeof result !== 'object') return null

  // 形态 1: 已转存
  const url1 = result.audio_url || result.origin_audio_url
  if (url1) {
    return {
      url: url1,
      mimeType: result.content_type,
      fileName: result.filename,
      fileSize: result.file_size,
      duration: typeof result.duration === 'number' ? result.duration : undefined,
      ossObjectKey: result.oss_object_key,
    }
  }

  // 形态 2: foxapi 裸响应包装
  const results = Array.isArray(result.results) ? result.results : []
  const first = results[0]
  if (first?.url) {
    return {
      url: first.url,
      mimeType: first.content_type,
      fileName: first.filename,
      fileSize: typeof first.file_size === 'number' ? first.file_size : undefined,
      duration: typeof first.duration === 'number' ? first.duration : undefined,
    }
  }

  return null
}
