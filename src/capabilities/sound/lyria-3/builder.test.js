/**
 * Lyria 3 builder 单测
 * 运行(需 @/ alias hook): node --test --import ./test/alias-hook.mjs src/capabilities/sound/lyria-3/builder.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLyria3RequestBody } from './builder.js'

test('默认 model lyria-3 + prompt + 服务端字段; 空 image_urls 不发送', () => {
  const { body, urlFields } = buildLyria3RequestBody({
    modeParams: { prompt: 'calm ambient piano, 90 BPM' },
    collectedInputs: {}, canvasId: 'p1', nodeId: 'n1',
  })
  assert.equal(body.model, 'lyria-3')
  assert.equal(body.prompt, 'calm ambient piano, 90 BPM')
  assert.equal(body.project_id, 'p1')
  assert.equal(body.node_id, 'n1')
  assert.equal('image_urls' in body, false)
  assert.deepEqual(urlFields, ['image_urls'])
})

test('pro model + 端口情绪板 image_urls（≤10，去空）', () => {
  const { body } = buildLyria3RequestBody({
    modeParams: { model: 'lyria-3-pro', prompt: 'epic anthem' },
    collectedInputs: { images: [
      { content: { url: 'https://x/1.jpg' } },
      { content: { url: 'https://x/2.jpg' } },
      { content: {} },
    ] },
    canvasId: 'p1', nodeId: 'n1',
  })
  assert.equal(body.model, 'lyria-3-pro')
  assert.deepEqual(body.image_urls, ['https://x/1.jpg', 'https://x/2.jpg'])
})

test('prompt 缺省为空串', () => {
  const { body } = buildLyria3RequestBody({ modeParams: {}, collectedInputs: {}, canvasId: 'p', nodeId: 'n' })
  assert.equal(body.prompt, '')
})

test('negative_prompt 非空时写进 body', () => {
  const { body } = buildLyria3RequestBody({
    modeParams: { prompt: 'x', negative_prompt: 'harsh, distorted' },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal(body.negative_prompt, 'harsh, distorted')
})

test('negative_prompt 空/纯空白/缺省时不发送', () => {
  for (const np of [undefined, '', '   ']) {
    const { body } = buildLyria3RequestBody({
      modeParams: { prompt: 'x', negative_prompt: np },
      collectedInputs: {}, canvasId: 'p', nodeId: 'n',
    })
    assert.equal('negative_prompt' in body, false)
  }
})
