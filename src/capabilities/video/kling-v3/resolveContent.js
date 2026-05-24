// resolveContent.js
export function resolveKlingV3Content(result) {
  if (!result || typeof result !== 'object') return null
  if (result.video_url) return { url: result.video_url }
  const v = Array.isArray(result.videos) ? result.videos[0] : null
  if (v && (v.file_url || v.origin_url)) {
    return { url: v.file_url || v.origin_url, fileSize: v.file_size, mimeType: v.content_type, fileName: v.filename }
  }
  if (result.origin_video_url) return { url: result.origin_video_url }
  return null
}
