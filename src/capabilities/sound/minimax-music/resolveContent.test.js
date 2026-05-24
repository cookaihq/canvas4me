/**
 * minimax-music resolveContent 单测
 * 运行: node --test src/capabilities/sound/minimax-music/resolveContent.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMinimaxMusicContent } from './resolveContent.js'

test('已转存对象: 取 audio_url + duration + 元信息', () => {
  const c = resolveMinimaxMusicContent({
    audio_url: 'https://oss/x.mp3', origin_audio_url: 'https://up/x.mp3',
    oss_object_key: 'k', file_size: 123, content_type: 'audio/mpeg',
    filename: 'x.mp3', storage_method: 'oss', duration: 94,
  })
  assert.equal(c.url, 'https://oss/x.mp3')
  assert.equal(c.duration, 94)
  assert.equal(c.mimeType, 'audio/mpeg')
  assert.equal(c.fileName, 'x.mp3')
  assert.equal(c.fileSize, 123)
  assert.equal(c.ossObjectKey, 'k')
})

test('无 audio_url 时回落 origin_audio_url', () => {
  const c = resolveMinimaxMusicContent({ origin_audio_url: 'https://up/x.mp3' })
  assert.equal(c.url, 'https://up/x.mp3')
})

test('foxapi 裸响应: 取 results[0].url', () => {
  const c = resolveMinimaxMusicContent({ results: [{ url: 'https://fox/x.mp3', duration: 60 }] })
  assert.equal(c.url, 'https://fox/x.mp3')
  assert.equal(c.duration, 60)
})

test('无结果返回 null', () => {
  assert.equal(resolveMinimaxMusicContent(null), null)
  assert.equal(resolveMinimaxMusicContent({}), null)
  assert.equal(resolveMinimaxMusicContent({ results: [] }), null)
})
