// 运行: node --test --import ./test/alias-hook.mjs src/canvas/utils/groupGrouping.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGroupedNodes, buildUngroupedNodes } from './groupGrouping.js'

test('buildGroupedNodes: 生成 group(排最前) + 成员设 parentId+相对坐标', () => {
  const prev = [
    { id: 'a', type: 'input', position: { x: 100, y: 100 }, measured: { width: 50, height: 50 } },
    { id: 'b', type: 'input', position: { x: 200, y: 100 }, measured: { width: 50, height: 50 } },
    { id: 'c', type: 'input', position: { x: 999, y: 999 }, measured: { width: 50, height: 50 } },
  ]
  const { nodes, groupId } = buildGroupedNodes(prev, new Set(['a', 'b']), 24)
  assert.equal(nodes[0].type, 'group')        // group 排最前(父在子前, spec §9.4)
  assert.equal(nodes[0].id, groupId)
  assert.deepEqual(nodes[0].position, { x: 76, y: 76 }) // 包围盒(100,100)~(250,150)外扩24
  const a = nodes.find(n => n.id === 'a')
  assert.equal(a.parentId, groupId)
  assert.deepEqual(a.position, { x: 24, y: 24 })       // 100-76
  const c = nodes.find(n => n.id === 'c')
  assert.equal(c.parentId, undefined)                 // 未选中不动
  assert.deepEqual(c.position, { x: 999, y: 999 })
})

test('buildUngroupedNodes: 删 group, 成员清 parentId + 相对转绝对', () => {
  const prev = [
    { id: 'g', type: 'group', position: { x: 76, y: 76 }, style: { width: 98, height: 98 } },
    { id: 'a', type: 'input', parentId: 'g', position: { x: 24, y: 24 } },
    { id: 'x', type: 'input', position: { x: 500, y: 500 } },
  ]
  const nodes = buildUngroupedNodes(prev, 'g')
  assert.equal(nodes.find(n => n.id === 'g'), undefined)      // group 删除
  const a = nodes.find(n => n.id === 'a')
  assert.equal(a.parentId, undefined)                         // 清 parentId
  assert.deepEqual(a.position, { x: 100, y: 100 })            // 相对(24,24)+origin(76,76)
  const x = nodes.find(n => n.id === 'x')
  assert.deepEqual(x.position, { x: 500, y: 500 })            // 无关节点不动
})

import { expandGroupDeletion } from './groupGrouping.js'

test('expandGroupDeletion: 删 group 连带其成员 + 成员里折叠能力的 output', () => {
  const prev = [
    { id: 'g', type: 'group' },
    { id: 'a', type: 'input', parentId: 'g' },
    { id: 'cap', type: 'capability', parentId: 'g', data: { capability: 'nano-banana' } },
    { id: 'out', type: 'output-image', data: { sourceCapabilityId: 'cap' } }, // 不在组里但属 cap
    { id: 'z', type: 'input' },
  ]
  const helpers = { isFoldedCapability: (c) => c === 'nano-banana', isOutputNodeType: (t) => t.startsWith('output-') }
  const ids = expandGroupDeletion(prev, new Set(['g']), helpers)
  assert.equal(ids.has('g'), true)
  assert.equal(ids.has('a'), true)
  assert.equal(ids.has('cap'), true)
  assert.equal(ids.has('out'), true)   // 折叠能力的 output 连带
  assert.equal(ids.has('z'), false)    // 无关不删
})
