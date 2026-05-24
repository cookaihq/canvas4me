/**
 * Lyria 3 结果解析单测
 * 运行: node --test src/capabilities/sound/lyria-3/resolveContent.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLyria3Content } from './resolveContent.js'

test('服务端形态: 取 audio_url + duration + 元数据', () => {
  const r = resolveLyria3Content({
    audio_url: 'https://oss/a.mp3', origin_audio_url: 'https://up/raw.mp3',
    content_type: 'audio/mpeg', filename: 'a.mp3', file_size: 123, duration: 30, oss_object_key: 'k',
  })
  assert.equal(r.url, 'https://oss/a.mp3')
  assert.equal(r.duration, 30)
  assert.equal(r.mimeType, 'audio/mpeg')
  assert.equal(r.fileName, 'a.mp3')
  assert.equal(r.ossObjectKey, 'k')
})

test('服务端形态: 无 audio_url 时回落 origin_audio_url', () => {
  const r = resolveLyria3Content({ origin_audio_url: 'https://up/raw.mp3' })
  assert.equal(r.url, 'https://up/raw.mp3')
})

test('foxapi 形态: 取 results[0].url', () => {
  const r = resolveLyria3Content({ results: [{ url: 'https://up/raw.mp3', content_type: 'audio/mpeg' }] })
  assert.equal(r.url, 'https://up/raw.mp3')
  assert.equal(r.mimeType, 'audio/mpeg')
})

test('空 / 非法结果 → null', () => {
  assert.equal(resolveLyria3Content(null), null)
  assert.equal(resolveLyria3Content({}), null)
  assert.equal(resolveLyria3Content({ results: [] }), null)
})
