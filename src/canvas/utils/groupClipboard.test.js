// 运行: node --test --import ./test/alias-hook.mjs src/canvas/utils/groupClipboard.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandCopyWithGroupMembers, remapParentIds, buildGroupDuplicate } from './groupClipboard.js'

test('expandCopyWithGroupMembers: 复制 group 连带成员', () => {
  const prev = [
    { id: 'g', type: 'group' },
    { id: 'a', type: 'input', parentId: 'g' },
    { id: 'z', type: 'input' },
  ]
  const ids = expandCopyWithGroupMembers(prev, new Set(['g']))
  assert.equal(ids.has('a'), true)
  assert.equal(ids.has('z'), false)
})

test('remapParentIds: 粘贴时旧 groupId→新 groupId, 不在 map 的清掉', () => {
  const idMap = { g: 'g2', a: 'a2' }
  const out = remapParentIds([
    { id: 'a2', parentId: 'g' },        // 父在 map → 重指向 g2
    { id: 'b2', parentId: 'gone' },     // 父不在 map(只复制了成员没复制组)→ 清 parentId
  ], idMap)
  assert.equal(out[0].parentId, 'g2')
  assert.equal(out[1].parentId, undefined)
})

test('buildGroupDuplicate: 克隆 group 连带成员, 新 id + parentId 重映射 + group 偏移 +20 + 成员相对不变', () => {
  const group = { id: 'g', type: 'group', position: { x: 100, y: 100 }, width: 200, height: 150, data: { name: '', color: '#abc' }, style: { width: 200, height: 150 } }
  const allNodes = [
    group,
    { id: 'a', type: 'input', parentId: 'g', position: { x: 24, y: 24 }, data: {} },
    { id: 'z', type: 'input', position: { x: 500, y: 500 }, data: {} }, // 自由节点, 不应被复制
  ]
  const { nodes } = buildGroupDuplicate(group, allNodes, [])
  assert.equal(nodes.length, 2) // 只 group + 成员 a (不含 z)
  const newGroup = nodes.find(n => n.type === 'group')
  const newMember = nodes.find(n => n.type === 'input')
  assert.notEqual(newGroup.id, 'g') // 新 id 不撞旧
  assert.notEqual(newMember.id, 'a')
  assert.deepEqual(newGroup.position, { x: 120, y: 120 }) // 顶层 +20
  assert.deepEqual(newMember.position, { x: 24, y: 24 }) // 成员相对不变
  assert.equal(newMember.parentId, newGroup.id) // parentId 重指向新 group
  assert.equal(newGroup.selected, true)
  assert.equal(newMember.selected, true)
})

test('buildGroupDuplicate: 内部边(折叠对)按 idMap 重映射 source/target', () => {
  const group = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: {} }
  const allNodes = [
    group,
    { id: 'cap', type: 'capability', parentId: 'g', position: { x: 10, y: 10 }, data: {} },
    { id: 'out', type: 'imageOutput', parentId: 'g', position: { x: 30, y: 10 }, data: { sourceCapabilityId: 'cap' } },
  ]
  const allEdges = [{ id: 'e1', source: 'cap', target: 'out', sourceHandle: 'o', targetHandle: 'input' }]
  const { nodes, edges } = buildGroupDuplicate(group, allNodes, allEdges)
  assert.equal(edges.length, 1)
  const ids = new Set(nodes.map(n => n.id))
  assert.equal(ids.has(edges[0].source), true) // source 指向新克隆节点
  assert.equal(ids.has(edges[0].target), true)
  assert.notEqual(edges[0].source, 'cap')
  // 折叠输出的 sourceCapabilityId 跟着重指向新能力节点
  const newOut = nodes.find(n => n.type === 'imageOutput')
  const newCap = nodes.find(n => n.type === 'capability')
  assert.equal(newOut.data.sourceCapabilityId, newCap.id)
})
