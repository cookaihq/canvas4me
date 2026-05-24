import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSegmentLayout } from './segmentLayout.js'

test('少且短 -> inline(标题在左)', () => {
  assert.equal(resolveSegmentLayout([{ label: '480p' }, { label: '720p' }]), 'inline')
})
test('选项多 -> block(标题在上)', () => {
  assert.equal(resolveSegmentLayout([
    { label: '1:1' }, { label: '16:9' }, { label: '9:16' }, { label: '4:3' }, { label: '3:4' },
  ]), 'block')
})
test('长标签 -> block', () => {
  assert.equal(resolveSegmentLayout([{ label: '标准' }, { label: '高清增强' }]), 'block')
})
test('支持纯字符串 options', () => {
  assert.equal(resolveSegmentLayout(['480p', '720p']), 'inline')
})
