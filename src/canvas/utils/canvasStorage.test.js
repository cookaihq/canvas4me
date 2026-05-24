// 运行: node --test src/canvas/utils/canvasStorage.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPersistedNode } from './canvasStorage.js'

test('丢弃顶层 RF 运行态/派生态字段', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'capability', position: { x: 1, y: 2 },
    width: 220, height: 200, parentId: undefined, zIndex: 3, style: { width: 220 },
    selected: true, dragging: true, resizing: true, hidden: false,
    measured: { width: 220, height: 200 }, internals: { positionAbsolute: {} },
    data: {},
  })
  assert.equal(out.selected, undefined)
  assert.equal(out.dragging, undefined)
  assert.equal(out.resizing, undefined)
  assert.equal(out.hidden, undefined)
  assert.equal(out.measured, undefined)
  assert.equal(out.internals, undefined)
  assert.deepEqual(out.position, { x: 1, y: 2 })
  assert.equal(out.width, 220)
  assert.equal(out.zIndex, 3)
  assert.deepEqual(out.style, { width: 220 })
})

test('保留领域态 + 运行态 data 字段', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'capability', position: { x: 0, y: 0 },
    data: {
      capability: 'gpt-image-2', mode: 'default', modeParams: { default: { prompt: 'x' } },
      name: 'A', color: '#fff', locked: true, portConnections: { in: ['e1'] },
      runStatus: 'Done', startedAt: 100, finishedAt: 200,
      extraTaskId: 't1', realTaskId: 'r1', taskId: 't1', transferRetryCount: 2,
      lastRunSnapshot: { prompt: 'x' }, inputSnapshot: { params: {} },
      slotIndex: 0, isPrimary: true, taskBatchKey: 'b1', sourceCapabilityId: 'c1', autoPositioned: true,
    },
  })
  for (const k of ['capability','mode','modeParams','name','color','locked','portConnections',
    'runStatus','startedAt','finishedAt','extraTaskId','realTaskId','taskId','transferRetryCount',
    'lastRunSnapshot','inputSnapshot','slotIndex','isPrimary','taskBatchKey','sourceCapabilityId','autoPositioned']) {
    assert.ok(k in out.data, `应保留 data.${k}`)
  }
})

test('丢弃 data 派生/会话字段', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'capability', position: { x: 0, y: 0 },
    data: {
      capability: 'x',
      _draft: { capability: 'y' }, _mediaWidth: 10, _mediaHeight: 20, _mediaFileSize: 30,
      _mediaDuration: 5, _imageAspect: 1.5, _ignoredCount: 2,
      canvasSeq: 7, hiddenEdgeCount: 3, downstreamOutput: { id: 'o1' }, userTouched: { default: { prompt: true } },
    },
  })
  for (const k of ['_draft','_mediaWidth','_mediaHeight','_mediaFileSize','_mediaDuration',
    '_imageAspect','_ignoredCount','canvasSeq','hiddenEdgeCount','downstreamOutput','userTouched']) {
    assert.equal(k in out.data, false, `应丢弃 data.${k}`)
  }
  assert.equal(out.data.capability, 'x')
})

test('content 子字段:删 localPreviewUrl、blob/data url 兜底为 null、保留其余', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'content', position: { x: 0, y: 0 },
    data: { content: {
      url: 'blob:http://x/1', localPreviewUrl: 'blob:http://x/2',
      fileName: 'a.png', fileSize: 100, mimeType: 'image/png',
      images: [{ url: 'https://y/1.png' }], usage: { input_tokens: 10 }, sseChunkOffset: 5,
    } },
  })
  assert.equal(out.data.content.localPreviewUrl, undefined)
  assert.equal(out.data.content.url, null)
  assert.equal(out.data.content.fileName, 'a.png')
  assert.equal(out.data.content.fileSize, 100)
  assert.deepEqual(out.data.content.images, [{ url: 'https://y/1.png' }])
  assert.deepEqual(out.data.content.usage, { input_tokens: 10 })
  assert.equal(out.data.content.sseChunkOffset, 5)
})

test('保留正常 http content.url', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'content', position: { x: 0, y: 0 },
    data: { content: { url: 'https://cdn/a.png' } },
  })
  assert.equal(out.data.content.url, 'https://cdn/a.png')
})

test('node.data 缺省安全', () => {
  const out = toPersistedNode({ id: 'n1', type: 'content', position: { x: 0, y: 0 } })
  assert.deepEqual(out.data, {})
})

test('content.rawError 不持久化(非序列化安全)', () => {
  const out = toPersistedNode({
    id: 'n1', type: 'content', position: { x: 0, y: 0 },
    data: { content: { url: 'https://cdn/a.png', rawError: new Error('boom') } },
  })
  assert.equal('rawError' in out.data.content, false)
  assert.equal(out.data.content.url, 'https://cdn/a.png')
})

test('toPersistedNode 不修改原始 node', () => {
  const original = {
    id: 'n1', type: 'capability', position: { x: 0, y: 0 }, selected: true,
    data: { _draft: {}, capability: 'x', content: { url: 'blob:x', localPreviewUrl: 'blob:y' } },
  }
  const dataRef = original.data
  const contentRef = original.data.content
  toPersistedNode(original)
  assert.equal(original.selected, true)
  assert.equal(original.data, dataRef)
  assert.equal(original.data.content, contentRef)
  assert.ok('_draft' in original.data)
  assert.equal(original.data.content.localPreviewUrl, 'blob:y')
})
