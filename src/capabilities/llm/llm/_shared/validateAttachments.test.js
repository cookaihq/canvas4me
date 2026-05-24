// 运行: node --test src/capabilities/llm/llm/_shared/validateAttachments.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAttachments } from './validateAttachments.js'

const CONSTRAINTS = {
  image: { maxCount: 2, maxSizeMB: 5, mime: ['image/png', 'image/jpeg'] },
  file: { maxCount: 1, maxSizeMB: 32, mime: ['application/pdf'] },
}
const MB = 1024 * 1024
const emptyGroups = { image: [], audio: [], video: [], file: [] }

test('全合法 → ok', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: 'u', fileSize: MB, mimeType: 'image/png' }] } })
  assert.equal(r.ok, true)
})
test('超数量 → count_exceeded', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: '1', mimeType: 'image/png' }, { url: '2', mimeType: 'image/png' }, { url: '3', mimeType: 'image/png' }] } })
  assert.equal(r.invalid.length, 1)
  assert.equal(r.invalid[0].reason, 'count_exceeded')
})
test('超大小 → size_exceeded', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: '1', fileSize: 6 * MB, mimeType: 'image/png' }] } })
  assert.equal(r.invalid[0].reason, 'size_exceeded')
})
test('MIME 不符 → mime_unsupported', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: '1', mimeType: 'image/webp' }] } })
  assert.equal(r.invalid[0].reason, 'mime_unsupported')
})
test('缺 fileSize/mimeType 跳过 size/mime', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: '1' }] } })
  assert.equal(r.ok, true)
})
test('无约束的 kind 不校验', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, video: [{ url: 'v', fileSize: 999 * MB }] } })
  assert.equal(r.ok, true)
  assert.equal(r.perKindCount.video, 1)
})
test('perKindCount 统计', () => {
  const r = validateAttachments({ constraints: CONSTRAINTS, groups: { ...emptyGroups, image: [{ url: '1', mimeType: 'image/png' }], file: [{ url: 'f', mimeType: 'application/pdf' }] } })
  assert.equal(r.perKindCount.image, 1)
  assert.equal(r.perKindCount.file, 1)
})
