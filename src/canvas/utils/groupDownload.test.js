// 运行: node --test --import ./test/alias-hook.mjs src/canvas/utils/groupDownload.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectDownloadables, buildDownloadFileNames, extFromUrl } from './groupDownload.js'

const isOutputNodeType = (t) => typeof t === 'string' && t.startsWith('output-')

test('collectDownloadables: 收 http(s) 产物, 跳文本/无 url; 选中 group 展开成员', () => {
  const prev = [
    { id: 'g', type: 'group' },
    { id: 'img', type: 'input', parentId: 'g', data: { name: '图A', content: { url: 'https://x/a.png' } } },
    { id: 'txt', type: 'input', parentId: 'g', data: { name: '文本', content: { text: 'hi' } } },
    { id: 'out', type: 'output-image', data: { content: { url: 'https://x/b.jpg' } } },
    { id: 'empty', type: 'capability', data: { content: {} } },
    { id: 'far', type: 'input', data: { content: { url: 'https://x/z.png' } } }, // 未选中
  ]
  const items = collectDownloadables(prev, new Set(['g', 'out']), { isOutputNodeType })
  const urls = items.map(i => i.url).sort()
  assert.deepEqual(urls, ['https://x/a.png', 'https://x/b.jpg']) // g 展开到 img(收)/txt(跳); out 收; far 未选不收
})

test('collectDownloadables: 跳过 data:/blob: 非远端 url', () => {
  const prev = [{ id: 'a', type: 'input', data: { content: { url: 'data:image/png;base64,xxx' } } }]
  assert.equal(collectDownloadables(prev, new Set(['a']), { isOutputNodeType }).length, 0)
})

test('extFromUrl', () => {
  assert.equal(extFromUrl('https://x/a.png?v=1'), 'png')
  assert.equal(extFromUrl('https://x/video.mp4'), 'mp4')
  assert.equal(extFromUrl('https://x/noext'), 'bin')
})

test('buildDownloadFileNames: sanitize + 去重', () => {
  const out = buildDownloadFileNames([
    { url: 'https://x/a.png', name: '图/A' },
    { url: 'https://x/b.png', name: '图/A' },     // 重名
    { url: 'https://x/c.mp4', name: '' },          // 空名
  ])
  assert.equal(out[0].fileName, '图_A.png')
  assert.equal(out[1].fileName, '图_A-2.png')      // 去重
  assert.equal(out[2].fileName, '未命名.mp4')      // 空名回落
})

test('buildDownloadFileNames: 产出的 -N 名与手写名也不撞', () => {
  const out = buildDownloadFileNames([
    { url: 'https://x/a.png', name: '图_A' },       // → 图_A.png
    { url: 'https://x/b.png', name: '图_A-2' },     // 手写恰好撞到自动后缀 → 图_A-2.png
    { url: 'https://x/c.png', name: '图_A' },        // 第二个 图_A: 图_A.png 占用 → 图_A-2.png 也占用 → 图_A-3.png
  ])
  const names = out.map(o => o.fileName)
  assert.deepEqual(names, ['图_A.png', '图_A-2.png', '图_A-3.png'])
  assert.equal(new Set(names).size, names.length) // 三个互不撞名
})
