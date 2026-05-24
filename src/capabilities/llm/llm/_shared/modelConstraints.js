/**
 * 模型附件约束表：per-type { maxCount, maxSizeMB, mime }。键 = 精确 id 或 通配符。
 * 大小/MIME 按上游 provider 2026 真实限制；maxCount 为画布 UX 产品默认（可调）。
 * 详见 docs/iteration/20260525-llm-custom-attachment-constraints/design.md §2.2。
 */
import { matchBestKey } from './modelConfigMatch.js'

export const MODEL_CONSTRAINTS = {
  'gpt-*': {
    image: { maxCount: 10, maxSizeMB: 20, mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
  },
  'claude-*': {
    image: { maxCount: 8, maxSizeMB: 5, mime: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] },
    file: { maxCount: 5, maxSizeMB: 32, mime: ['application/pdf', 'text/plain', 'text/markdown'] },
  },
  'gemini-*': {
    image: { maxCount: 10, maxSizeMB: 20, mime: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'] },
    audio: { maxCount: 5, maxSizeMB: 75, mime: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'] },
    video: { maxCount: 3, maxSizeMB: 100, mime: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/avi', 'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp'] },
    file: { maxCount: 5, maxSizeMB: 50, mime: ['application/pdf', 'text/plain', 'text/markdown', 'text/html', 'text/xml'] },
  },
  '*': {
    image: { maxCount: 8, maxSizeMB: 5, mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
  },
}

export function resolveModelConstraints(id) {
  const m = matchBestKey(MODEL_CONSTRAINTS, id)
  return m && m.value ? m.value : {}
}
