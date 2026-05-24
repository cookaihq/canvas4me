// _shared/pricing.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKlingV3ModelId, computeKlingV3Units } from './pricing.js'

test('文生 720p 裸档', () => assert.equal(resolveKlingV3ModelId({ mode: 'text-to-video', modeParams: { resolution: '720p' } }), 'kling-v3-text-to-video[720p]'))
test('文生 720p 开音频 → [720p|audio]', () => assert.equal(resolveKlingV3ModelId({ mode: 'text-to-video', modeParams: { resolution: '720p', generate_audio: true } }), 'kling-v3-text-to-video[720p|audio]'))
test('图生 1080p → image-to-video[1080p]', () => assert.equal(resolveKlingV3ModelId({ mode: 'image-to-video', modeParams: { resolution: '1080p' } }), 'kling-v3-image-to-video[1080p]'))
test('首尾帧用 image-to-video model id', () => assert.equal(resolveKlingV3ModelId({ mode: 'first-last-frame', modeParams: { resolution: '720p' } }), 'kling-v3-image-to-video[720p]'))
test('动作控制 std/pro', () => {
  assert.equal(resolveKlingV3ModelId({ mode: 'motion-control', modeParams: { mode: 'std' } }), 'kling-v3-motion-control')
  assert.equal(resolveKlingV3ModelId({ mode: 'motion-control', modeParams: { mode: 'pro' } }), 'kling-v3-motion-control[pro]')
})
test('computeUnits = duration（文生/图生/首尾帧）；动作控制 null', () => {
  assert.equal(computeKlingV3Units({ mode: 'text-to-video', modeParams: { duration: 10 } }), 10)
  assert.equal(computeKlingV3Units({ mode: 'motion-control', modeParams: {} }), null)
})
