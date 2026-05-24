/**
 * nodeFactory 单元测试
 *
 * 运行(需 @/ alias hook): node --test --import ./test/alias-hook.mjs src/canvas/utils/nodeFactory.test.js
 *
 * 覆盖: 折叠能力节点"创建即带 output + internal 边"的成对返回契约(D-eager)。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerCapability } from '../registry/nodeTypes.js'
import { createCapabilityNode, deriveCapabilityNode, retargetFoldedOutputNode } from './nodeFactory.js'

// 注册两个折叠测试能力(form:'folded' + productType + 单主输出),用于成对返回 + 改型测试
registerCapability({
  id: 'folded-test-cap',
  nodeType: 'image',
  label: 'Folded Test',
  form: 'folded',
  productType: 'image',
  defaultMode: 'default',
  modes: {
    default: {
      inputs: [],
      outputs: [{ id: 'image-out', type: 'image', role: 'image_result' }],
    },
  },
})

registerCapability({
  id: 'folded-test-cap-2',
  nodeType: 'video',
  label: 'Folded Test 2',
  form: 'folded',
  productType: 'video',
  defaultMode: 'default',
  modes: {
    default: {
      inputs: [],
      outputs: [{ id: 'video-out', type: 'video', role: 'video_result' }],
    },
  },
})

test('createCapabilityNode for folded capability returns paired output + internal edge', () => {
  const { nodes, edges } = createCapabilityNode('image', { x: 0, y: 0 }, 'folded-test-cap', { mode: 'default' })
  assert.equal(nodes.length, 2)
  const cap = nodes.find(n => n.type === 'capability')
  const out = nodes.find(n => n.type === 'output-folded-test-cap')
  assert.ok(cap && out)
  assert.equal(out.data.sourceCapabilityId, cap.id)
  assert.equal(out.data.sourceCapability, 'folded-test-cap')
  assert.equal(out.data.sourceMode, 'default')
  assert.equal(edges.length, 1)
  assert.equal(edges[0].source, cap.id)
  assert.equal(edges[0].target, out.id)
  assert.equal(edges[0].sourceHandle, 'image-out')
  assert.equal(edges[0].targetHandle, 'input')
  assert.equal(edges[0].type, 'custom')
})

test('createCapabilityNode for non-folded capability returns single node, no edges', () => {
  const { nodes, edges } = createCapabilityNode('llm', { x: 0, y: 0 }, null)
  assert.equal(nodes.length, 1)
  assert.equal(edges.length, 0)
})

test('deriveCapabilityNode for folded capability returns paired output + internal edge', () => {
  const { nodes: srcNodes } = createCapabilityNode('image', { x: 0, y: 0 }, 'folded-test-cap', { mode: 'default' })
  const srcCap = srcNodes.find(n => n.type === 'capability')
  const { nodes, edges } = deriveCapabilityNode(srcCap, 'folded-test-cap', { preserveParams: true })
  assert.equal(nodes.length, 2)
  const cap = nodes.find(n => n.type === 'capability')
  const out = nodes.find(n => n.type === 'output-folded-test-cap')
  assert.ok(cap && out)
  assert.notEqual(cap.id, srcCap.id)
  assert.equal(out.data.sourceCapabilityId, cap.id)
  assert.equal(edges.length, 1)
  assert.equal(edges[0].source, cap.id)
  assert.equal(edges[0].target, out.id)
})

test('retargetFoldedOutputNode keeps output id, retypes to new capability + sourceHandle', () => {
  const { nodes } = createCapabilityNode('image', { x: 0, y: 0 }, 'folded-test-cap', { mode: 'default' })
  const out = nodes.find(n => n.type === 'output-folded-test-cap')
  const r = retargetFoldedOutputNode(out, 'folded-test-cap-2', 'default', 'video')
  assert.equal(r.outputNode.id, out.id)                       // 保留 id → 下游边不断
  assert.equal(r.outputNode.type, 'output-folded-test-cap-2') // 改型
  assert.equal(r.outputNode.data.subType, 'video')
  assert.equal(r.outputNode.data.sourceCapability, 'folded-test-cap-2')
  assert.equal(r.outputNode.data.sourceCapabilityId, out.data.sourceCapabilityId) // 宿主不变
  assert.equal(r.sourceHandle, 'video-out')                   // internal 边新主输出端口
})
