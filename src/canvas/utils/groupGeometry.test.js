// 运行: node --test --import ./test/alias-hook.mjs src/canvas/utils/groupGeometry.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getNodeRect, getBoundingBox, toRelative, toAbsolute, computeGroupBox, isPointInRect, rectsIntersect } from './groupGeometry.js'

test('getNodeRect 用 measured 优先, 回退 style', () => {
  assert.deepEqual(getNodeRect({ position: { x: 10, y: 20 }, measured: { width: 100, height: 50 } }), { x: 10, y: 20, width: 100, height: 50 })
  assert.deepEqual(getNodeRect({ position: { x: 0, y: 0 }, style: { width: 200, height: 120 } }), { x: 0, y: 0, width: 200, height: 120 })
})
test('getBoundingBox 求多节点包围盒', () => {
  assert.deepEqual(getBoundingBox([
    { position: { x: 0, y: 0 }, measured: { width: 100, height: 100 } },
    { position: { x: 200, y: 50 }, measured: { width: 100, height: 100 } },
  ]), { x: 0, y: 0, width: 300, height: 150 })
})
test('computeGroupBox = 包围盒外扩 padding', () => {
  assert.deepEqual(computeGroupBox([{ position: { x: 100, y: 100 }, measured: { width: 50, height: 50 } }], 24), { x: 76, y: 76, width: 98, height: 98 })
})
test('toRelative / toAbsolute 互逆', () => {
  const origin = { x: 76, y: 76 }
  assert.deepEqual(toRelative({ x: 100, y: 100 }, origin), { x: 24, y: 24 })
  assert.deepEqual(toAbsolute({ x: 24, y: 24 }, origin), { x: 100, y: 100 })
})
test('isPointInRect / rectsIntersect', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 }
  assert.equal(isPointInRect({ x: 50, y: 50 }, rect), true)
  assert.equal(isPointInRect({ x: 150, y: 50 }, rect), false)
  assert.equal(rectsIntersect(rect, { x: 90, y: 90, width: 50, height: 50 }), true)
  assert.equal(rectsIntersect(rect, { x: 200, y: 0, width: 10, height: 10 }), false)
})
