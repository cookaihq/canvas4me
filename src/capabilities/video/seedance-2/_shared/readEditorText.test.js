/**
 * readTextFromEditor 单元测试
 *
 * 运行: node --test src/capabilities/video/seedance-2/_shared/readEditorText.test.js
 *
 * 回归点: 浏览器 contentEditable 回车会插入 <div>/<p> 块, 序列化必须把它们当换行,
 *        否则换行只在当次编辑可见, 存盘字符串无 \n, 刷新后换行丢失。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTextFromEditor } from './readEditorText.js'

// readTextFromEditor 依赖浏览器内置的 Node 常量; node 环境下手动注入
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 }

// ── 极简假 DOM ──
const textNode = (t) => ({ nodeType: 3, textContent: t })
const el = (tag, opts = {}) => {
  const { className = '', dataset = {}, children = [] } = opts
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    dataset,
    classList: { contains: (c) => className.split(/\s+/).includes(c) },
    childNodes: children,
    get textContent() {
      return children.map((c) => c.textContent || '').join('')
    },
  }
}
const editor = (children) => ({ childNodes: children })

test('回车产生的 <div> 块视为换行 (回归: 刷新后换行丢失)', () => {
  const ed = editor([
    textNode('line1'),
    el('div', { children: [textNode('line2')] }),
    el('div', { children: [textNode('line3')] }),
  ])
  assert.equal(readTextFromEditor(ed), 'line1\nline2\nline3')
})

test('<br> 换行', () => {
  const ed = editor([textNode('a'), el('br'), textNode('b')])
  assert.equal(readTextFromEditor(ed), 'a\nb')
})

test('div 内含资源 chip: 块换行 + chip 正确序列化 (不被 textContent 拍平)', () => {
  const ed = editor([
    textNode('first'),
    el('div', {
      children: [
        el('span', { className: 'sd2-chip', dataset: { anchor: 'image-3' } }),
        textNode(' tail'),
      ],
    }),
  ])
  assert.equal(readTextFromEditor(ed), 'first\n@Image3 tail')
})

test('资源 chip 序列化为 @Image/@Video/@Audio', () => {
  const ed = editor([
    textNode('看 '),
    el('span', { className: 'sd2-chip', dataset: { anchor: 'image-1' } }),
    textNode(' 和 '),
    el('span', { className: 'sd2-chip', dataset: { anchor: 'video-2' } }),
  ])
  assert.equal(readTextFromEditor(ed), '看 @Image1 和 @Video2')
})

test('文本端口 chip 序列化为 edge placeholder', () => {
  const ed = editor([
    el('span', { className: 'tp-chip', dataset: { sourceNodeId: 'n_42' } }),
  ])
  assert.equal(readTextFromEditor(ed), '{{ai-canvas:edge:n_42}}')
})

test('nbsp 归一为普通空格', () => {
  const ed = editor([textNode('a b')])
  assert.equal(readTextFromEditor(ed), 'a b')
})
