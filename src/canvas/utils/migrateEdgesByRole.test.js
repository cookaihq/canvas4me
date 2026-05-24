/**
 * migrateEdgesByRole 单元测试
 *
 * 运行: node --test src/canvas/utils/migrateEdgesByRole.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateEdgesByRole } from './migrateEdgesByRole.js'

const NODE = 'cap-node-1'

const edge = (id, targetHandle, extras = {}) => ({
  id,
  source: 'src',
  sourceHandle: 'out',
  target: NODE,
  targetHandle,
  type: 'custom',
  ...extras,
})

test('严格 role 匹配: 同名 role → 端口 id 改写', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'subject_image', canAcceptRoles: ['subject_image'] }]
  const newInputs = [{ id: 'subject', accept: ['image'], role: 'subject_image', canAcceptRoles: ['subject_image'] }]
  const edges = [edge('e1', 'image')]
  const { migratedEdges, failedEdgeIds } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.equal(failedEdgeIds.length, 0)
  assert.equal(migratedEdges[0].targetHandle, 'subject')
})

test('canAcceptRoles fallback: 新端口显式接受老 role', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'subject_image' }]
  const newInputs = [{ id: 'image', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image', 'subject_image'] }]
  const edges = [edge('e1', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.equal(failedEdgeIds.length, 0)
  assert.equal(migratedEdges[0].targetHandle, 'image')
})

test('双方都有 role 但不匹配 → 失败', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'subject_image' }]
  const newInputs = [{ id: 'image', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const edges = [edge('e1', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds, ['e1'])
  // 失败 edge 的 targetHandle 保留原值
  assert.equal(migratedEdges[0].targetHandle, 'image')
})

test('老端口缺 role → 失败 (Phase 5 起严格匹配, 不再降级)', () => {
  const oldInputs = [{ id: 'image', accept: ['image'] }]   // 无 role
  const newInputs = [{ id: 'reference', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const edges = [edge('e1', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds, ['e1'])
  assert.equal(migratedEdges[0].targetHandle, 'image')
})

test('新端口缺 role → 失败 (Phase 5 起严格匹配, 不再降级)', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'subject_image' }]
  const newInputs = [{ id: 'pic', accept: ['image'] }]   // 无 role
  const edges = [edge('e1', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds, ['e1'])
  assert.equal(migratedEdges[0].targetHandle, 'image')
})

test('多 → 单 自适应: 第 1 根接上, 其余失败', () => {
  const oldInputs = [{ id: 'images', accept: ['image'], multiple: true, role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const newInputs = [{ id: 'image', accept: ['image'], multiple: false, role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const edges = [edge('e1', 'images'), edge('e2', 'images'), edge('e3', 'images')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds, ['e2', 'e3'])
  assert.equal(migratedEdges[0].targetHandle, 'image')
  // e2 / e3 失败保留原 targetHandle
  assert.equal(migratedEdges[1].targetHandle, 'images')
  assert.equal(migratedEdges[2].targetHandle, 'images')
})

test('单 → 多: 一根接进多选第一格', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], multiple: false, role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const newInputs = [{ id: 'images', accept: ['image'], multiple: true, role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const edges = [edge('e1', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.equal(failedEdgeIds.length, 0)
  assert.equal(migratedEdges[0].targetHandle, 'images')
})

test('找不到任何匹配 → 全部失败', () => {
  const oldInputs = [
    { id: 'image', accept: ['image'], role: 'subject_image' },
    { id: 'audio', accept: ['audio'], role: 'driver_audio' },
  ]
  const newInputs = [{ id: 'prompt', accept: ['text'], role: 'prompt_text', canAcceptRoles: ['prompt_text'] }]
  const edges = [edge('e1', 'image'), edge('e2', 'audio')]
  const { failedEdgeIds } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds.sort(), ['e1', 'e2'])
})

test('按 newInputs 声明顺序: 多个端口都能接同一 role 时取第一个', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image'] }]
  const newInputs = [
    { id: 'first_ref', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image'], multiple: false },
    { id: 'second_ref', accept: ['image'], role: 'reference_image', canAcceptRoles: ['reference_image'], multiple: false },
  ]
  const edges = [edge('e1', 'image'), edge('e2', 'image')]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  // 第 1 根占满 first_ref, 第 2 根落到 second_ref
  assert.equal(failedEdgeIds.length, 0)
  assert.equal(migratedEdges[0].targetHandle, 'first_ref')
  assert.equal(migratedEdges[1].targetHandle, 'second_ref')
})

test('其他节点的 edges 不动 (target !== nodeId)', () => {
  const oldInputs = [{ id: 'image', accept: ['image'], role: 'subject_image' }]
  const newInputs = [{ id: 'prompt', accept: ['text'], role: 'prompt_text' }]
  const edges = [
    edge('e1', 'image'),
    { id: 'other', source: 's', sourceHandle: 'o', target: 'other-node', targetHandle: 'image', type: 'custom' },
  ]
  const { failedEdgeIds, migratedEdges } = migrateEdgesByRole({ edges, nodeId: NODE, oldInputs, newInputs })
  assert.deepEqual(failedEdgeIds, ['e1'])
  // 其他节点的 edge 引用未变
  assert.equal(migratedEdges[1], edges[1])
})

test('nodeId 缺失或 edges 不是数组 → 原样返回', () => {
  assert.deepEqual(
    migrateEdgesByRole({ edges: null, nodeId: 'x', oldInputs: [], newInputs: [] }),
    { migratedEdges: [], failedEdgeIds: [] }
  )
  const edges = [edge('e1', 'image')]
  assert.deepEqual(
    migrateEdgesByRole({ edges, nodeId: '', oldInputs: [], newInputs: [] }),
    { migratedEdges: edges, failedEdgeIds: [] }
  )
})
