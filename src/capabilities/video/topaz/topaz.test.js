import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = pathResolve(__dirname, '../../../..')
const srcRoot = pathResolve(repoRoot, 'src')

const hooksCode = `
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as pathResolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const srcRoot = ${JSON.stringify(srcRoot)}

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2)
    let absolutePath = pathResolve(srcRoot, relativePath)
    if (!existsSync(absolutePath)) absolutePath = absolutePath + '.js'
    if (!existsSync(absolutePath)) absolutePath = absolutePath.replace(/\\.js$/, '.jsx')
    return { url: pathToFileURL(absolutePath).href, shortCircuit: true }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.match(/\\.jsx?$/)) {
    const base = context.parentURL ? fileURLToPath(context.parentURL) : srcRoot
    const absolute = pathResolve(dirname(base), specifier)
    if (existsSync(absolute + '.js')) return { url: pathToFileURL(absolute + '.js').href, shortCircuit: true }
    if (existsSync(absolute + '.jsx')) return { url: pathToFileURL(absolute + '.jsx').href, shortCircuit: true }
  }
  return next(specifier, context)
}
`

register(
  `data:text/javascript,${encodeURIComponent(hooksCode)}`,
  { parentURL: pathToFileURL('/').href }
)

const { buildTopazRequestBody } = await import('./builder.js')
const { resolveTopazContent } = await import('./resolveContent.js')
const {
  createTopazVideoInputAttachment,
  insertTopazVideoInputAttachment,
  replaceTopazVideoInputEdge,
  applyTopazVideoUploadSuccess,
  removeTopazVideoInputConnection,
  removeTopazVideoInputAttachment,
} = await import('./inputAttachment.js')

test('buildTopazRequestBody prefers the video port and only sends the current API whitelist', () => {
  const result = buildTopazRequestBody({
    mode: 'upscale-video',
    canvasId: 'canvas-1',
    nodeId: 'node-1',
    collectedInputs: {
      video: { content: { url: 'https://cdn.example.com/from-port.mp4' } },
    },
    modeParams: {
      video_url: 'https://cdn.example.com/from-param.mp4',
      enhancement_model: 'Nyx HF',
      upscale_factor: 4,
      target_fps: 60,
      compression: 0.5,
      noise: 0.3,
      halo: null,
      grain: undefined,
      recover_detail: 0.6,
      h264_output: true,
      engine: 'legacy',
      scale: 2,
      frame_interpolation: true,
      detail: 0.2,
    },
  })

  assert.deepEqual(result, {
    body: {
      project_id: 'canvas-1',
      node_id: 'node-1',
      model: 'topaz-upscale-video',
      video_url: 'https://cdn.example.com/from-port.mp4',
      enhancement_model: 'Nyx HF',
      upscale_factor: 4,
      target_fps: 60,
      compression: 0.5,
      noise: 0.3,
      recover_detail: 0.6,
      h264_output: true,
    },
    urlFields: ['video_url'],
  })
})

test('buildTopazRequestBody fills default enhancement model and upscale factor', () => {
  const result = buildTopazRequestBody({
    mode: 'upscale-video',
    canvasId: 'canvas-1',
    nodeId: 'node-1',
    collectedInputs: {
      video: [{ content: { url: 'https://cdn.example.com/input.mp4' } }],
    },
    modeParams: {},
  })

  assert.equal(result.body.enhancement_model, 'Proteus')
  assert.equal(result.body.upscale_factor, 2)
})

test('buildTopazRequestBody accepts flat video input items from the thumbnail row', () => {
  const result = buildTopazRequestBody({
    mode: 'upscale-video',
    canvasId: 'canvas-1',
    nodeId: 'node-1',
    collectedInputs: {
      video: [{ url: 'https://cdn.example.com/thumb-row-input.mp4' }],
    },
    modeParams: {},
  })

  assert.equal(result.body.video_url, 'https://cdn.example.com/thumb-row-input.mp4')
})

test('buildTopazRequestBody logs input diagnostics before missing input video error', () => {
  const calls = captureConsoleWarn(() => {
    assert.throws(() => buildTopazRequestBody({
      mode: 'upscale-video',
      canvasId: 'canvas-1',
      nodeId: 'topaz-1',
      collectedInputs: {
        video: [{
          nodeId: 'video-source-1',
          subType: 'video',
          sourceHandle: 'video',
          label: 'source.mp4',
          content: {
            fileName: 'source.mp4',
            uploading: false,
          },
        }],
      },
      modeParams: {},
    }), /请提供输入视频/)
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '[Topaz] missing input video before submit')
  assert.deepEqual(calls[0][1], {
    canvasId: 'canvas-1',
    nodeId: 'topaz-1',
    collectedInputKeys: ['video'],
    modeParamsVideoUrlPresent: false,
    resolvedVideoUrl: null,
    videoInput: {
      present: true,
      itemCount: 1,
      items: [{
        index: 0,
        nodeId: 'video-source-1',
        subType: 'video',
        sourceHandle: 'video',
        label: 'source.mp4',
        hasContent: true,
        contentKeys: ['fileName', 'uploading'],
        contentUrl: undefined,
        flatUrl: undefined,
        uploading: false,
        fileName: 'source.mp4',
      }],
    },
  })
})

test('buildTopazRequestBody rejects missing input video and invalid ranges', () => {
  captureConsoleWarn(() => {
    assert.throws(() => buildTopazRequestBody({
      mode: 'upscale-video',
      canvasId: 'canvas-1',
      nodeId: 'node-1',
      collectedInputs: {},
      modeParams: {},
    }), /请提供输入视频/)
  })

  assert.throws(() => buildTopazRequestBody({
    mode: 'upscale-video',
    canvasId: 'canvas-1',
    nodeId: 'node-1',
    collectedInputs: { video: { content: { url: 'https://cdn.example.com/input.mp4' } } },
    modeParams: { upscale_factor: 5 },
  }), /放大倍率/)
})

test('resolveTopazContent prefers transferred videos and falls back to upstream result shapes', () => {
  assert.deepEqual(resolveTopazContent({
    videos: [{
      file_url: 'https://oss.example.com/video.mp4',
      file_size: 1234,
      content_type: 'video/mp4',
      filename: 'video.mp4',
    }],
    video_url: 'https://fallback.example.com/video.mp4',
  }), {
    url: 'https://oss.example.com/video.mp4',
    fileSize: 1234,
    mimeType: 'video/mp4',
    fileName: 'video.mp4',
  })

  assert.deepEqual(resolveTopazContent({
    results: [{ url: 'https://upstream.example.com/raw.mp4', content_type: 'video/mp4' }],
  }), {
    url: 'https://upstream.example.com/raw.mp4',
    mimeType: 'video/mp4',
    fileName: undefined,
    fileSize: undefined,
  })
})

test('Topaz video input attachment creates a video input node and connects it to the Topaz video port', () => {
  const capabilityNode = {
    id: 'topaz-1',
    type: 'capability',
    position: { x: 800, y: 240 },
    data: { portConnections: {} },
  }

  const attachment = createTopazVideoInputAttachment({
    capabilityNode,
    fileName: 'source.mp4',
    createInputNode: createTestInputNode,
  })

  assert.equal(attachment.inputNode.type, 'input')
  assert.equal(attachment.inputNode.data.subType, 'video')
  assert.equal(attachment.inputNode.data.content.uploading, true)
  assert.equal(attachment.inputNode.data.name, 'source.mp4')
  assert.equal(attachment.inputNode.position.x, 120)
  assert.deepEqual(attachment.edge, {
    id: `edge-${attachment.inputNode.id}-topaz-1-video`,
    source: attachment.inputNode.id,
    sourceHandle: 'video',
    target: 'topaz-1',
    targetHandle: 'video',
    type: 'custom',
  })

  const nextNodes = insertTopazVideoInputAttachment([capabilityNode], attachment)
  const nextTopaz = nextNodes.find(n => n.id === 'topaz-1')
  assert.deepEqual(nextTopaz.data.portConnections.video, [{
    source: attachment.inputNode.id,
    sourceHandle: 'video',
  }])

  const nextEdges = replaceTopazVideoInputEdge([
    { id: 'old', target: 'topaz-1', targetHandle: 'video' },
  ], attachment)
  assert.deepEqual(nextEdges, [attachment.edge])
})

test('Topaz video input attachment updates upload result and cleans up on failure', () => {
  const capabilityNode = {
    id: 'topaz-1',
    type: 'capability',
    position: { x: 800, y: 240 },
    data: { portConnections: {} },
  }
  const attachment = createTopazVideoInputAttachment({
    capabilityNode,
    fileName: 'source.mp4',
    createInputNode: createTestInputNode,
  })
  const nodes = insertTopazVideoInputAttachment([capabilityNode], attachment)
  const uploaded = applyTopazVideoUploadSuccess(nodes, {
    inputNodeId: attachment.inputNode.id,
    uploadResult: { url: 'https://cdn.example.com/source.mp4' },
    fileName: 'source.mp4',
    duration: 12,
  })
  assert.deepEqual(uploaded.find(n => n.id === attachment.inputNode.id).data.content, {
    url: 'https://cdn.example.com/source.mp4',
    fileName: 'source.mp4',
    duration: 12,
  })

  const cleaned = removeTopazVideoInputAttachment(uploaded, attachment)
  assert.equal(cleaned.some(n => n.id === attachment.inputNode.id), false)
  assert.deepEqual(cleaned.find(n => n.id === 'topaz-1').data.portConnections.video, [])
})

test('Topaz video input connection deletion clears the video port without deleting ordinary source nodes', () => {
  const capabilityNode = {
    id: 'topaz-1',
    type: 'capability',
    data: {
      portConnections: {
        video: [{ source: 'video-source-1', sourceHandle: 'video' }],
      },
    },
  }
  const sourceNode = {
    id: 'video-source-1',
    type: 'input',
    data: {
      subType: 'video',
      content: { url: 'https://cdn.example.com/source.mp4' },
    },
  }

  const nextNodes = removeTopazVideoInputConnection([capabilityNode, sourceNode], {
    targetNodeId: 'topaz-1',
    sourceNodeId: 'video-source-1',
    sourceHandle: 'video',
  })

  assert.equal(nextNodes.some(n => n.id === 'video-source-1'), true)
  assert.deepEqual(nextNodes.find(n => n.id === 'topaz-1').data.portConnections.video, [])
})

test('Topaz video input connection deletion can remove an uploading panel placeholder', () => {
  const capabilityNode = {
    id: 'topaz-1',
    type: 'capability',
    data: {
      portConnections: {
        video: [{ source: 'video-source-1', sourceHandle: 'video' }],
      },
    },
  }
  const sourceNode = {
    id: 'video-source-1',
    type: 'input',
    data: {
      subType: 'video',
      content: { uploading: true },
    },
  }

  const nextNodes = removeTopazVideoInputConnection([capabilityNode, sourceNode], {
    targetNodeId: 'topaz-1',
    sourceNodeId: 'video-source-1',
    sourceHandle: 'video',
    removeSourceNode: true,
  })

  assert.equal(nextNodes.some(n => n.id === 'video-source-1'), false)
  assert.deepEqual(nextNodes.find(n => n.id === 'topaz-1').data.portConnections.video, [])
})

let testNodeCounter = 0

function createTestInputNode(subType, position, extraData = {}) {
  testNodeCounter += 1
  return {
    id: `input-test-${testNodeCounter}`,
    type: 'input',
    position,
    data: {
      subType,
      label: subType,
      content: {},
      ...extraData,
    },
    style: { width: 620, height: 348 },
  }
}

function captureConsoleWarn(fn) {
  const originalWarn = console.warn
  const calls = []
  console.warn = (...args) => calls.push(args)

  try {
    fn()
  } finally {
    console.warn = originalWarn
  }

  return calls
}
