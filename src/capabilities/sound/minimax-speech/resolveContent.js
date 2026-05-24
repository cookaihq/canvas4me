/**
 * MiniMax Speech 结果解析 —— 见 docs/capabilities/sound/minimax-speech.md §"task.result"
 *
 * 兼容两种形态:
 *
 * 1) 后端已转存 (audio_url 等顶层字段):
 *    {
 *      audio_url, origin_audio_url, oss_object_key,
 *      file_size, content_type, filename, storage_method, duration
 *    }
 *
 * 2) 上游裸响应 (foxapi normalizeTaskStatus 包成 result.results[]):
 *    { results: [{ url, content_type? }] }     ← foxapi /v1/audios/generations 完成后的 url 24h 失效
 *
 * 返回 node.data.content:
 *   - url: 主播放/下载地址
 *   - mimeType / fileName / fileSize / duration / ossObjectKey: 元数据
 */
export function resolveMinimaxSpeechContent(result) {
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

  // 形态 2: 上游裸响应 (foxapi 包成 { results: [...] })
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
