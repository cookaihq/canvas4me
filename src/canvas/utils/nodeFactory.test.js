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
import { createCapabilityNode, deriveCapabilityNode, retargetFoldedOutputNode, sanitizeClonedNodeData, cloneNodeWithFoldedOutput } from './nodeFactory.js'

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

// ── sanitizeClonedNodeData: 克隆节点必须斩断"任务身份",防止副本与原节点共享后台任务 ──
// (原节点还在轮询时被复制 → 任务结果回来会被群发到共享同一 task id 的所有节点 → 产物串号)

test('sanitizeClonedNodeData 清除所有任务身份与运行计时字段', () => {
  const cleaned = sanitizeClonedNodeData({
    label: '视频', subType: 'video',
    taskId: 't1', extraTaskId: 'cvs-x', realTaskId: 'r1',
    taskBatchKey: 'b1', slotIndex: 2, isPrimary: true,
    startedAt: 1, finishedAt: 2, lastPollingItem: {}, lastPolledAt: 3,
    transferRetryCount: 1,
    runStatus: 'done', content: { url: 'https://x/v.mp4' },
  })
  for (const k of ['taskId', 'extraTaskId', 'realTaskId', 'taskBatchKey', 'slotIndex',
    'isPrimary', 'startedAt', 'finishedAt', 'lastPollingItem', 'lastPolledAt', 'transferRetryCount']) {
    assert.ok(!(k in cleaned), `${k} 应被清除`)
  }
})

test('sanitizeClonedNodeData 保留已完成节点的产物(done → 副本仍显示视频)', () => {
  const cleaned = sanitizeClonedNodeData({
    runStatus: 'done', content: { url: 'https://x/v.mp4' }, extraTaskId: 'cvs-x',
  })
  assert.equal(cleaned.runStatus, 'done')
  assert.equal(cleaned.content.url, 'https://x/v.mp4')
  assert.ok(!('extraTaskId' in cleaned))
})

test('sanitizeClonedNodeData 把在途态(polling)归零为 idle 并清空空产物', () => {
  const cleaned = sanitizeClonedNodeData({
    runStatus: 'polling', extraTaskId: 'cvs-x', taskId: 'cvs-x', content: {},
  })
  assert.equal(cleaned.runStatus, 'idle')
  assert.deepEqual(cleaned.content, {})
  assert.ok(!('extraTaskId' in cleaned))
  assert.ok(!('taskId' in cleaned))
})

test('sanitizeClonedNodeData 保留用户上传内容节点的 url(无任务字段)', () => {
  const cleaned = sanitizeClonedNodeData({ subType: 'video', content: { url: 'https://x/u.mp4' } })
  assert.equal(cleaned.content.url, 'https://x/u.mp4')
})

test('sanitizeClonedNodeData 不修改入参对象', () => {
  const input = { taskId: 't1', runStatus: 'polling', content: { url: null } }
  sanitizeClonedNodeData(input)
  assert.equal(input.taskId, 't1')
  assert.equal(input.runStatus, 'polling')
})

// ── cloneNodeWithFoldedOutput: 折叠能力节点要连产物一起克隆,不能得到空壳 ──

test('cloneNodeWithFoldedOutput 折叠能力节点连下游输出 + internal 边一起克隆,产物保留', () => {
  const { nodes: pair } = createCapabilityNode('image', { x: 0, y: 0 }, 'folded-test-cap', { mode: 'default' })
  const srcCap = pair.find(n => n.type === 'capability')
  const srcOut = pair.find(n => n.type === 'output-folded-test-cap')
  // 模拟跑完: 输出节点带产物 + 任务身份
  srcOut.data = { ...srcOut.data, runStatus: 'done', content: { url: 'https://x/v.mp4' }, extraTaskId: 'cvs-x', taskId: 'cvs-x' }

  const { nodes, edges } = cloneNodeWithFoldedOutput(srcCap, { allNodes: [srcCap, srcOut], position: { x: 0, y: 500 } })

  assert.equal(nodes.length, 2)
  assert.equal(edges.length, 1)
  const newCap = nodes.find(n => n.type === 'capability')
  const newOut = nodes.find(n => n.type === 'output-folded-test-cap')
  assert.ok(newCap && newOut)
  assert.notEqual(newCap.id, srcCap.id)              // 新能力节点新 id
  assert.notEqual(newOut.id, srcOut.id)              // 新输出节点新 id
  assert.equal(newOut.data.content.url, 'https://x/v.mp4')  // 产物保留(副本带视频)
  assert.equal(newOut.data.sourceCapabilityId, newCap.id)   // 反查重指向新能力节点
  assert.ok(!('extraTaskId' in newOut.data))         // 任务身份斩断
  assert.ok(!('taskId' in newOut.data))
  assert.equal(edges[0].source, newCap.id)           // internal 边接新对
  assert.equal(edges[0].target, newOut.id)
})

test('cloneNodeWithFoldedOutput 普通(非折叠)节点只克隆单节点', () => {
  const src = { id: 'input-1', type: 'input', position: { x: 0, y: 0 }, data: { subType: 'video', content: { url: 'https://x/u.mp4' } } }
  const { nodes, edges } = cloneNodeWithFoldedOutput(src, { allNodes: [src] })
  assert.equal(nodes.length, 1)
  assert.equal(edges.length, 0)
  assert.notEqual(nodes[0].id, src.id)
  assert.equal(nodes[0].data.content.url, 'https://x/u.mp4')
})

test('cloneNodeWithFoldedOutput 折叠能力节点找不到下游输出时降级为单节点', () => {
  const { nodes: pair } = createCapabilityNode('image', { x: 0, y: 0 }, 'folded-test-cap', { mode: 'default' })
  const srcCap = pair.find(n => n.type === 'capability')
  const { nodes, edges } = cloneNodeWithFoldedOutput(srcCap, { allNodes: [srcCap] }) // 不传 output
  assert.equal(nodes.length, 1)
  assert.equal(edges.length, 0)
})

import { createGroupNode } from './nodeFactory.js'

test('createGroupNode 造一个 group 节点(几何+name+color, 无成员列表)', () => {
  const g = createGroupNode({ x: 76, y: 76, width: 98, height: 98 })
  assert.equal(g.type, 'group')
  assert.ok(g.id.startsWith('group-'))
  assert.deepEqual(g.position, { x: 76, y: 76 })
  assert.equal(g.width, 98) // 顶层 width/height: React Flow 12 渲染优先, 与 NodeResizer 写的字段一致
  assert.equal(g.height, 98)
  assert.deepEqual(g.style, { width: 98, height: 98 }) // style 同步保留(getNodeRect fallback / 兼容)
  assert.equal(g.data.name, '')
  assert.ok(typeof g.data.color === 'string')
  assert.equal(g.data.memberIds, undefined) // 不存成员列表(spec §2.2)
})
