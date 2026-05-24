import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as pathResolve } from 'node:path'
import { dirname } from 'node:path'

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
    let p = pathResolve(srcRoot, specifier.slice(2))
    if (!existsSync(p)) p = p + '.js'
    if (!existsSync(p)) p = p.replace(/\\.js$/, '.jsx')
    return { url: pathToFileURL(p).href, shortCircuit: true }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.match(/\\.jsx?$/)) {
    const base = context.parentURL ? fileURLToPath(context.parentURL) : srcRoot
    const abs = pathResolve(dirname(base), specifier)
    if (existsSync(abs + '.js')) return { url: pathToFileURL(abs + '.js').href, shortCircuit: true }
    if (existsSync(abs + '.jsx')) return { url: pathToFileURL(abs + '.jsx').href, shortCircuit: true }
  }
  return next(specifier, context)
}
`
register(`data:text/javascript,${encodeURIComponent(hooksCode)}`, { parentURL: pathToFileURL('/').href })

const { buildCreatifyAuroraRequestBody } = await import('./builder.js')
const { resolveCreatifyAuroraContent } = await import('./resolveContent.js')

test('builder: 端口优先,只发白名单字段,含 guidance 默认值', () => {
  const result = buildCreatifyAuroraRequestBody({
    canvasId: 'canvas-1',
    nodeId: 'node-1',
    collectedInputs: {
      image: { content: { url: 'https://cdn.example.com/from-port.png' } },
      audio: { content: { url: 'https://cdn.example.com/from-port.mp3' } },
    },
    modeParams: {
      image_url: 'https://cdn.example.com/from-param.png',
      audio_url: 'https://cdn.example.com/from-param.mp3',
      resolution: '480p',
      prompt: '棚拍光线',
      duration: 10,            // 必须被剥离
      aspect_ratio: '16:9',    // 必须被剥离
    },
  })
  assert.deepEqual(result, {
    body: {
      project_id: 'canvas-1',
      node_id: 'node-1',
      model: 'creatify-aurora',
      image_url: 'https://cdn.example.com/from-port.png',
      audio_url: 'https://cdn.example.com/from-port.mp3',
      resolution: '480p',
      prompt: '棚拍光线',
      guidance_scale: 1,
      audio_guidance_scale: 2,
    },
    urlFields: ['image_url', 'audio_url'],
  })
})

test('builder: 无端口时回退面板上传值;分辨率默认 720p;空 prompt 不发', () => {
  const result = buildCreatifyAuroraRequestBody({
    canvasId: 'c', nodeId: 'n',
    collectedInputs: {},
    modeParams: {
      image_url: 'https://cdn.example.com/p.png',
      audio_url: 'https://cdn.example.com/a.mp3',
      prompt: '   ',
      guidance_scale: 3.5,
      audio_guidance_scale: 0,
    },
  })
  assert.equal(result.body.resolution, '720p')
  assert.equal('prompt' in result.body, false)
  assert.equal(result.body.guidance_scale, 3.5)
  assert.equal(result.body.audio_guidance_scale, 0)
})

test('resolveContent: 优先 videos[0].file_url,回退 video_url,再回退 foxapi 裸响应 results[0].url', () => {
  assert.deepEqual(resolveCreatifyAuroraContent({
    videos: [{ file_url: 'https://oss.example.com/v.mp4', file_size: 999, content_type: 'video/mp4', filename: 'v.mp4' }],
    video_url: 'https://fallback.example.com/v.mp4',
  }), { url: 'https://oss.example.com/v.mp4', fileSize: 999, mimeType: 'video/mp4', fileName: 'v.mp4' })

  assert.equal(resolveCreatifyAuroraContent({ video_url: 'https://x.example.com/v.mp4' }).url, 'https://x.example.com/v.mp4')

  assert.equal(resolveCreatifyAuroraContent({ results: [{ url: 'https://up.example.com/raw.mp4' }] }).url, 'https://up.example.com/raw.mp4')

  assert.equal(resolveCreatifyAuroraContent(null), null)
  assert.equal(resolveCreatifyAuroraContent({}), null)
})

test('resolveContent: videos[0].origin_url 与 origin_video_url 两档兜底', () => {
  assert.deepEqual(resolveCreatifyAuroraContent({
    videos: [{ origin_url: 'https://up.example.com/o.mp4', content_type: 'video/mp4', filename: 'o.mp4' }],
  }), { url: 'https://up.example.com/o.mp4', mimeType: 'video/mp4', fileName: 'o.mp4' })

  assert.deepEqual(resolveCreatifyAuroraContent({
    origin_video_url: 'https://up.example.com/ov.mp4',
  }), { url: 'https://up.example.com/ov.mp4', mimeType: 'video/mp4' })
})
