// _shared/models.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModelForMode } from './models.js'

test('文生映射', () => assert.equal(resolveModelForMode('text-to-video'), 'kling-v3-text-to-video'))
test('图生与首尾帧共用 image-to-video model', () => {
  assert.equal(resolveModelForMode('image-to-video'), 'kling-v3-image-to-video')
  assert.equal(resolveModelForMode('first-last-frame'), 'kling-v3-image-to-video')
})
test('动作控制映射', () => assert.equal(resolveModelForMode('motion-control'), 'kling-v3-motion-control'))
test('未知 mode 抛错', () => assert.throws(() => resolveModelForMode('nope')))
