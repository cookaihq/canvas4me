/**
 * minimax-music builder 单测
 * 运行(需 @/ alias hook): node --test --import ./test/alias-hook.mjs src/capabilities/sound/minimax-music/builder.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMinimaxMusicRequestBody } from './builder.js'

test('默认: v2.6 + 纯器乐 → is_instrumental:true, 无 lyrics/lyrics_optimizer', () => {
  const { body, urlFields } = buildMinimaxMusicRequestBody({
    modeParams: { prompt: 'ambient lofi, 80 BPM' },
    collectedInputs: {}, canvasId: 'p1', nodeId: 'n1',
  })
  assert.equal(body.model, 'minimax-music-v2.6')
  assert.equal(body.prompt, 'ambient lofi, 80 BPM')
  assert.equal(body.project_id, 'p1')
  assert.equal(body.node_id, 'n1')
  assert.equal(body.is_instrumental, true)
  assert.equal('lyrics' in body, false)
  assert.equal('lyrics_optimizer' in body, false)
  assert.deepEqual(urlFields, [])
})

test('自己写词 + 歌词文本 → body.lyrics, 无 is_instrumental/lyrics_optimizer', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { prompt: 'p', vocalMode: 'lyrics', lyrics: '[Verse]\nhello' },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal(body.lyrics, '[Verse]\nhello')
  assert.equal('is_instrumental' in body, false)
  assert.equal('lyrics_optimizer' in body, false)
})

test('自己写词但歌词为空/纯空白 → 三个人声字段都不发', () => {
  for (const ly of [undefined, '', '   ']) {
    const { body } = buildMinimaxMusicRequestBody({
      modeParams: { prompt: 'p', vocalMode: 'lyrics', lyrics: ly },
      collectedInputs: {}, canvasId: 'p', nodeId: 'n',
    })
    assert.equal('lyrics' in body, false)
    assert.equal('is_instrumental' in body, false)
    assert.equal('lyrics_optimizer' in body, false)
  }
})

test('自动生成歌词 + v2.5 → lyrics_optimizer:true, 无 lyrics/is_instrumental', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { model: 'minimax-music-v2.5', prompt: 'p', vocalMode: 'auto' },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal(body.lyrics_optimizer, true)
  assert.equal('lyrics' in body, false)
  assert.equal('is_instrumental' in body, false)
})

test('防御: 自动生成歌词 + v2.6(不支持) → 退化为自己写词(不发 lyrics_optimizer)', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { model: 'minimax-music-v2.6', prompt: 'p', vocalMode: 'auto', lyrics: 'la la' },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal('lyrics_optimizer' in body, false)
  assert.equal(body.lyrics, 'la la')
})

test('防御: 自动生成歌词 + v2.6 + 无歌词 → 三个人声字段都不发(上游兜底)', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { model: 'minimax-music-v2.6', prompt: 'p', vocalMode: 'auto', lyrics: '' },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal('is_instrumental' in body, false)
  assert.equal('lyrics' in body, false)
  assert.equal('lyrics_optimizer' in body, false)
})

test('歌词从端口连入(placeholder 展开)', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { prompt: 'p', vocalMode: 'lyrics', lyrics: '{{ai-canvas:edge:src}}' },
    collectedInputs: { lyrics: [{ nodeId: 'src', content: { text: '[Chorus]\nwoah' } }] },
    canvasId: 'p', nodeId: 'n',
  })
  assert.equal(body.lyrics, '[Chorus]\nwoah')
})

test('audio_setting: 全默认不发送', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { prompt: 'p', audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' } },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.equal('audio_setting' in body, false)
})

test('audio_setting: 只发非默认子字段', () => {
  const { body } = buildMinimaxMusicRequestBody({
    modeParams: { prompt: 'p', audio_setting: { format: 'wav', sample_rate: 44100 } },
    collectedInputs: {}, canvasId: 'p', nodeId: 'n',
  })
  assert.deepEqual(body.audio_setting, { format: 'wav' })
})

test('prompt 缺省为空串', () => {
  const { body } = buildMinimaxMusicRequestBody({ modeParams: {}, collectedInputs: {}, canvasId: 'p', nodeId: 'n' })
  assert.equal(body.prompt, '')
})
