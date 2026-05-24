import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMediaForm } from './mediaForm.js'

test('容量 <=2 默认宽卡', () => {
  assert.equal(resolveMediaForm({ maxCount: 1 }), 'card')
  assert.equal(resolveMediaForm({ maxCount: 2 }), 'card')
})
test('容量 >2 默认缩略图', () => {
  assert.equal(resolveMediaForm({ maxCount: 3 }), 'thumb')
  assert.equal(resolveMediaForm({ maxCount: 9 }), 'thumb')
})
test('能力可覆盖容量默认', () => {
  assert.equal(resolveMediaForm({ maxCount: 9, form: 'card' }), 'card')
  assert.equal(resolveMediaForm({ maxCount: 1, form: 'thumb' }), 'thumb')
})
test('缺省参数=card', () => {
  assert.equal(resolveMediaForm(), 'card')
})
