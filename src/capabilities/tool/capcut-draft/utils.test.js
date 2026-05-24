// src/capabilities/tool/capcut-draft/utils.test.js
// 运行: node --test src/capabilities/tool/capcut-draft/utils.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { secondsToMicros, microsToSeconds, sanitizeDraftName, basenameFromUrl, defaultDraftName } from './utils.js'

test('secondsToMicros · integer seconds → micros', () => {
  assert.equal(secondsToMicros(5), 5_000_000)
})
test('secondsToMicros · floating seconds rounded', () => {
  assert.equal(secondsToMicros(1.5), 1_500_000)
  assert.equal(secondsToMicros(0.333333), 333_333)
})
test('secondsToMicros · zero', () => {
  assert.equal(secondsToMicros(0), 0)
})

test('microsToSeconds · round-trip', () => {
  assert.equal(microsToSeconds(5_000_000), 5)
  assert.equal(microsToSeconds(1_500_000), 1.5)
})

test('sanitizeDraftName · 保留正常字符', () => {
  assert.equal(sanitizeDraftName('我的视频_0515'), '我的视频_0515')
})
test('sanitizeDraftName · 去掉 / 和 \\', () => {
  assert.equal(sanitizeDraftName('a/b\\c'), 'abc')
})
test('sanitizeDraftName · 两端 trim', () => {
  assert.equal(sanitizeDraftName('  hello  '), 'hello')
})
test('sanitizeDraftName · 全是非法字符 → 空串', () => {
  assert.equal(sanitizeDraftName('///'), '')
})

test('basenameFromUrl · 普通 URL', () => {
  assert.equal(basenameFromUrl('https://x.com/a/b/clip1.mp4'), 'clip1.mp4')
})
test('basenameFromUrl · 带 query', () => {
  assert.equal(basenameFromUrl('https://x.com/clip.mp4?token=abc'), 'clip.mp4')
})
test('basenameFromUrl · 空/null → null', () => {
  assert.equal(basenameFromUrl(''), null)
  assert.equal(basenameFromUrl(null), null)
})

test('defaultDraftName · 画布名 + 日期', () => {
  const result = defaultDraftName('我的视频', new Date('2026-05-15T10:00:00'))
  assert.equal(result, '我的视频_0515')
})
test('defaultDraftName · 画布名缺失 → 用 ai-canvas-草稿', () => {
  const result = defaultDraftName('', new Date('2026-05-15'))
  assert.equal(result, 'ai-canvas-草稿_0515')
})
test('defaultDraftName · 画布名含非法字符 → sanitize', () => {
  const result = defaultDraftName('a/b', new Date('2026-05-15'))
  assert.equal(result, 'ab_0515')
})
