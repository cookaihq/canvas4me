// src/capabilities/llm/llm/_shared/buildCustomMessages.test.js
// 运行: node --test src/capabilities/llm/llm/_shared/buildCustomMessages.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleMessages } from './buildCustomMessages.js'

test('纯文本：无附件 + 无 system → content 是字符串', () => {
  const msgs = assembleMessages({ systemPrompt: '', promptText: '你好', images: [], videos: [], audios: [], files: [] })
  assert.deepEqual(msgs, [{ role: 'user', content: '你好' }])
})

test('有 system → messages[0] 是 system', () => {
  const msgs = assembleMessages({ systemPrompt: '你是助理', promptText: '你好', images: [], videos: [], audios: [], files: [] })
  assert.equal(msgs[0].role, 'system')
  assert.equal(msgs[0].content, '你是助理')
  assert.equal(msgs[1].role, 'user')
})

test('混合附件：块顺序 图→视→音→文件→文本，user.content 是数组', () => {
  const msgs = assembleMessages({
    systemPrompt: '',
    promptText: '分析',
    images: ['https://x/a.jpg'],
    videos: ['https://x/v.mp4'],
    audios: ['https://x/a.wav'],
    files: ['https://x/r.pdf'],
  })
  assert.deepEqual(msgs[0].content, [
    { type: 'image_url', image_url: { url: 'https://x/a.jpg' } },
    { type: 'video_url', video_url: { url: 'https://x/v.mp4' } },
    { type: 'audio_url', audio_url: { url: 'https://x/a.wav' } },
    { type: 'file_url', file_url: { url: 'https://x/r.pdf' } },
    { type: 'text', text: '分析' },
  ])
})

test('有附件但 prompt 为空 → 不追加 text 块', () => {
  const msgs = assembleMessages({ systemPrompt: '', promptText: '', images: ['https://x/a.jpg'], videos: [], audios: [], files: [] })
  assert.deepEqual(msgs[0].content, [{ type: 'image_url', image_url: { url: 'https://x/a.jpg' } }])
})

test('多图保持顺序', () => {
  const msgs = assembleMessages({ systemPrompt: '', promptText: '', images: ['u1', 'u2'], videos: [], audios: [], files: [] })
  assert.deepEqual(msgs[0].content.map(b => b.image_url.url), ['u1', 'u2'])
})
