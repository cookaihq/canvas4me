import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupByCategory } from './groupCapabilities.js'

const CATS = {
  'talking-head':  { label: '数字人',   icon: 'i1', order: 10 },
  'video-gen':     { label: '视频生成', icon: 'i2', order: 20 },
  'video-process': { label: '视频处理', icon: 'i3', order: 30 },
}

test('命名分类按 order 排序,各成一组', () => {
  const caps = [
    { id: 'topaz', category: 'video-process' },
    { id: 'fabric', category: 'talking-head' },
    { id: 'seedance-2', category: 'video-gen' },
    { id: 'sync', category: 'talking-head' },
  ]
  const groups = groupByCategory(caps, CATS)
  assert.deepEqual(groups.map(g => g.categoryId), ['talking-head', 'video-gen', 'video-process'])
  assert.deepEqual(groups[0].capabilities.map(c => c.id), ['fabric', 'sync'])
  assert.equal(groups[0].label, '数字人')
  assert.equal(groups[0].icon, 'i1')
})

test('只有未分类能力 → 单默认桶,label=null(平铺)', () => {
  const caps = [{ id: 'gpt-image-2' }, { id: 'foo' }]
  const groups = groupByCategory(caps, CATS)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].categoryId, null)
  assert.equal(groups[0].label, null)
  assert.deepEqual(groups[0].capabilities.map(c => c.id), ['gpt-image-2', 'foo'])
})

test('命名分类 + 未分类混合 → 未分类作"其它"垫底', () => {
  const caps = [
    { id: 'seedance-2', category: 'video-gen' },
    { id: 'mystery' },
  ]
  const groups = groupByCategory(caps, CATS)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].categoryId, 'video-gen')
  assert.equal(groups[1].categoryId, null)
  assert.equal(groups[1].label, '其它')
  assert.deepEqual(groups[1].capabilities.map(c => c.id), ['mystery'])
})

test('未知 category(字典里没有)当作未分类', () => {
  const caps = [{ id: 'x', category: 'no-such-cat' }]
  const groups = groupByCategory(caps, CATS)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].categoryId, null)
  assert.equal(groups[0].label, null)
})
