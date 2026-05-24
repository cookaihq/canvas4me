import { test, expect } from 'vitest'
import { formatMediaMeta } from './mediaMeta.js'

test('图片 = 宽×高 · 大小', () => {
  expect(formatMediaMeta('image', { width: 2752, height: 1536, fileSize: 5138022 })).toBe('2752×1536 · 4.9M')
})
test('音频 = 时长 · 大小', () => {
  expect(formatMediaMeta('audio', { duration: 3, fileSize: 48044 })).toBe('0:03 · 46.9K')
})
test('视频 = 宽×高 · 时长 · 大小', () => {
  expect(formatMediaMeta('video', { width: 1280, height: 720, duration: 8, fileSize: 6500000 })).toBe('1280×720 · 0:08 · 6.2M')
})
test('视频缺时长 → 只 宽×高 · 大小', () => {
  expect(formatMediaMeta('video', { width: 1280, height: 720, fileSize: 6500000 })).toBe('1280×720 · 6.2M')
})
