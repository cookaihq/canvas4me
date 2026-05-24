// _shared/assembleBody.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleKlingV3Body } from './assembleBody.js'

const base = { projectId: 'p1', nodeId: 'n1' }

test('文生：必发字段 + 默认裁剪', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'text-to-video', prompt: '一只猫', multiPrompt: null, urls: {}, modeParams: { aspect_ratio: '16:9', resolution: '720p', duration: 5, generate_audio: false } })
  assert.equal(body.project_id, 'p1')
  assert.equal(body.node_id, 'n1')
  assert.equal(body.model, 'kling-v3-text-to-video')
  assert.equal(body.prompt, '一只猫')
  assert.equal(body.aspect_ratio, '16:9')
  assert.equal(body.resolution, '720p')
  assert.equal(body.duration, 5)
  assert.equal('multi_prompt' in body, false)
  assert.equal('negative_prompt' in body, false) // 空不发
  assert.equal('voice_ids' in body, false)
})

test('prompt ⊕ multi_prompt：有 multiPrompt 时发 multi_prompt、不发 prompt', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'text-to-video', prompt: '', multiPrompt: [{ prompt: 'a', duration: 5 }, { prompt: 'b', duration: 5 }], urls: {}, modeParams: { resolution: '1080p' } })
  assert.deepEqual(body.multi_prompt, [{ prompt: 'a', duration: 5 }, { prompt: 'b', duration: 5 }])
  assert.equal('prompt' in body, false)
})

test('图生：发 image_url，不发 aspect_ratio', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'image-to-video', prompt: '动起来', multiPrompt: null, urls: { image_url: 'https://x/a.png' }, modeParams: { aspect_ratio: '16:9', resolution: '720p', duration: 5 } })
  assert.equal(body.model, 'kling-v3-image-to-video')
  assert.equal(body.image_url, 'https://x/a.png')
  assert.equal('aspect_ratio' in body, false) // 图生无比例
  assert.equal('image_tail_url' in body, false)
})

test('首尾帧：发 image_url + image_tail_url，同 image-to-video model', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'first-last-frame', prompt: '过渡', multiPrompt: null, urls: { image_url: 'https://x/a.png', image_tail_url: 'https://x/b.png' }, modeParams: { resolution: '1080p', duration: 10 } })
  assert.equal(body.model, 'kling-v3-image-to-video')
  assert.equal(body.image_url, 'https://x/a.png')
  assert.equal(body.image_tail_url, 'https://x/b.png')
  assert.equal('aspect_ratio' in body, false)
})

test('动作控制：只发自身字段，无 resolution/duration/audio/aspect_ratio', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'motion-control', prompt: '跳舞', multiPrompt: null, urls: { image_url: 'https://x/c.png', video_url: 'https://x/m.mp4' }, modeParams: { mode: 'pro', character_orientation: 'image', keep_original_sound: 'yes', resolution: '1080p' } })
  assert.equal(body.model, 'kling-v3-motion-control')
  assert.equal(body.image_url, 'https://x/c.png')
  assert.equal(body.video_url, 'https://x/m.mp4')
  assert.equal(body.mode, 'pro')
  assert.equal(body.character_orientation, 'image')
  assert.equal(body.keep_original_sound, 'yes')
  assert.equal(body.prompt, '跳舞')
  assert.equal('resolution' in body, false)
  assert.equal('duration' in body, false)
  assert.equal('generate_audio' in body, false)
  assert.equal('aspect_ratio' in body, false)
})

test('voice_ids：generate_audio 关时不发；开且非空时发', () => {
  const off = assembleKlingV3Body({ ...base, mode: 'text-to-video', prompt: 'x', multiPrompt: null, urls: {}, modeParams: { generate_audio: false, voice_ids: ['v1'] } })
  assert.equal('voice_ids' in off, false)
  const on = assembleKlingV3Body({ ...base, mode: 'text-to-video', prompt: 'x', multiPrompt: null, urls: {}, modeParams: { generate_audio: true, voice_ids: ['v1', 'v2'] } })
  assert.deepEqual(on.voice_ids, ['v1', 'v2'])
  assert.equal(on.generate_audio, true)
})

test('negative_prompt 非空才发', () => {
  const body = assembleKlingV3Body({ ...base, mode: 'text-to-video', prompt: 'x', multiPrompt: null, urls: {}, modeParams: { negative_prompt: '模糊' } })
  assert.equal(body.negative_prompt, '模糊')
})
