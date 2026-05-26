/**
 * mediaTypeMap 单元测试
 *
 * 运行: node --test src/canvas/utils/mediaTypeMap.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapMediaTypeToSubType } from './mediaTypeMap.js'

test('mapMediaTypeToSubType: image → image', () => {
  assert.equal(mapMediaTypeToSubType('image'), 'image')
})

test('mapMediaTypeToSubType: video → video', () => {
  assert.equal(mapMediaTypeToSubType('video'), 'video')
})

test('mapMediaTypeToSubType: audio → audio', () => {
  assert.equal(mapMediaTypeToSubType('audio'), 'audio')
})

test('mapMediaTypeToSubType: text → text', () => {
  assert.equal(mapMediaTypeToSubType('text'), 'text')
})

test('mapMediaTypeToSubType: 未知类型 → null', () => {
  assert.equal(mapMediaTypeToSubType('unknown'), null)
  assert.equal(mapMediaTypeToSubType(undefined), null)
  assert.equal(mapMediaTypeToSubType(''), null)
  assert.equal(mapMediaTypeToSubType(null), null)
})
