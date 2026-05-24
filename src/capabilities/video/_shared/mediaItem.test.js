import { test, expect } from 'vitest'
import { deriveMediaItem } from './mediaItem.js'

const cap = { id: 'cap1' }
const edge = (id, source, targetHandle) => ({ id, source, target: 'cap1', targetHandle, type: 'custom' })

test('无连线 → null', () => {
  expect(deriveMediaItem({ node: cap, edges: [], nodes: [], portId: 'image', subType: 'image' })).toBe(null)
})

test('连到"上传中"源节点 → uploading 项，thumb 取本地预览', () => {
  const src = { id: 's1', data: { name: 'a.png', content: { uploading: true, localPreviewUrl: 'blob:x' } } }
  const item = deriveMediaItem({ node: cap, edges: [edge('e1', 's1', 'image')], nodes: [src], portId: 'image', subType: 'image' })
  expect(item).toMatchObject({ id: 'e1', type: 'image', uploading: true, thumb: 'blob:x', url: null, sourceNodeId: 's1', edgeId: 'e1' })
})

test('上游 _media* 字段透传到 item（供卡片 meta 用）', () => {
  const src = { id: 's6', data: { name: 'a.png', content: { url: 'https://x/a.png' }, _mediaWidth: 2752, _mediaHeight: 1536, _mediaFileSize: 5138022, _mediaDuration: null } }
  const item = deriveMediaItem({ node: cap, edges: [edge('e6', 's6', 'image')], nodes: [src], portId: 'image', subType: 'image' })
  expect(item).toMatchObject({ width: 2752, height: 1536, fileSize: 5138022, duration: null })
})

test('连到"已完成"源节点 → 非 uploading，thumb 取远端 url', () => {
  const src = { id: 's2', data: { name: 'a.png', content: { url: 'https://x/a.png' } } }
  const item = deriveMediaItem({ node: cap, edges: [edge('e2', 's2', 'image')], nodes: [src], portId: 'image', subType: 'image' })
  expect(item).toMatchObject({ uploading: false, thumb: 'https://x/a.png', url: 'https://x/a.png' })
})

test('音频已完成：thumb 为空（无视觉预览），url 仍在', () => {
  const src = { id: 's3', data: { name: 'a.m4a', content: { url: 'https://x/a.m4a' } } }
  const item = deriveMediaItem({ node: cap, edges: [edge('e3', 's3', 'audio')], nodes: [src], portId: 'audio', subType: 'audio' })
  expect(item).toMatchObject({ type: 'audio', url: 'https://x/a.m4a' })
  expect(item.thumb).toBeUndefined()
})

test('源节点缺失 → null', () => {
  expect(deriveMediaItem({ node: cap, edges: [edge('e4', 'gone', 'image')], nodes: [], portId: 'image', subType: 'image' })).toBe(null)
})

test('连线但源节点空（无 url 非 uploading）→ null', () => {
  const src = { id: 's5', data: { content: {} } }
  expect(deriveMediaItem({ node: cap, edges: [edge('e5', 's5', 'image')], nodes: [src], portId: 'image', subType: 'image' })).toBe(null)
})

test('视频已完成：thumb 取 url(供 <video> 首帧)', () => {
  const src = { id: 's7', data: { name: 'v.mp4', content: { url: 'https://x/v.mp4' }, _mediaWidth: 1280, _mediaHeight: 720, _mediaDuration: 8, _mediaFileSize: 6500000 } }
  const item = deriveMediaItem({ node: cap, edges: [edge('e7', 's7', 'video')], nodes: [src], portId: 'video', subType: 'video' })
  expect(item).toMatchObject({ type: 'video', thumb: 'https://x/v.mp4', url: 'https://x/v.mp4', width: 1280, height: 720, duration: 8, fileSize: 6500000 })
})
