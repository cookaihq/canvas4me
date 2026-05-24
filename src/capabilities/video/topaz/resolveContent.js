export function resolveTopazContent(result) {
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
