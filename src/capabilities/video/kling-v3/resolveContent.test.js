// resolveContent.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKlingV3Content } from './resolveContent.js'

test('优先 video_url', () => {
  assert.deepEqual(resolveKlingV3Content({ video_url: 'https://x/v.mp4' }), { url: 'https://x/v.mp4' })
})
test('兜底 videos[0].file_url', () => {
  const r = resolveKlingV3Content({ videos: [{ file_url: 'https://x/f.mp4', file_size: 123, content_type: 'video/mp4', filename: 'f.mp4' }] })
  assert.equal(r.url, 'https://x/f.mp4')
  assert.equal(r.fileSize, 123)
  assert.equal(r.mimeType, 'video/mp4')
  assert.equal(r.fileName, 'f.mp4')
})
test('无可用 url 返回 null', () => assert.equal(resolveKlingV3Content({}), null))
