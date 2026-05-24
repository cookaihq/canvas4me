/**
 * walkToText / readPromptFromEditor 单元测试 (T2V / 图生 / 首尾帧 共用的提示词序列化)
 *
 * 运行: node --test src/canvas/components/walkEditorToText.test.js
 *
 * 回归点: contentEditable 回车会插入 <div>/<p> 块, 序列化必须当换行,
 *        否则换行只在当次编辑可见, 存盘字符串无 \n, 刷新后换行丢失。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkToText, readPromptFromEditor } from './walkEditorToText.js'

// 依赖浏览器内置的 Node 常量; node 环境下手动注入
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 }

// ── 极简假 DOM ──
const textNode = (t) => ({ nodeType: 3, textContent: t })
const el = (tag, opts = {}) => {
  const { className = '', dataset = {}, children = [] } = opts
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    dataset,
    classList: { contains: (c) => className.split(/\s+/).filter(Boolean).includes(c) },
    childNodes: children,
    getAttribute: (name) => (name === 'data-source-node-id' ? (dataset.sourceNodeId ?? null) : null),
    querySelector: () => null,
  }
}
const editor = (children) => ({ childNodes: children })

test('回车产生的 <div> 块视为换行 (回归: 刷新后换行丢失)', () => {
  const ed = editor([
    textNode('line1'),
    el('div', { children: [textNode('line2')] }),
    el('div', { children: [textNode('line3')] }),
  ])
  assert.equal(readPromptFromEditor(ed), 'line1\nline2\nline3')
})

test('<br> 换行', () => {
  const ed = editor([textNode('a'), el('br'), textNode('b')])
  assert.equal(readPromptFromEditor(ed), 'a\nb')
})

test('文本端口 chip → placeholder 字面', () => {
  const ed = editor([
    textNode('用 '),
    el('span', { className: 'tp-chip', dataset: { sourceNodeId: 'n_7' } }),
    textNode(' 总结'),
  ])
  assert.equal(readPromptFromEditor(ed), '用 {{ai-canvas:edge:n_7}} 总结')
})

test('div 内含 chip: 块换行 + chip 不被 textContent 拍平', () => {
  const ed = editor([
    textNode('top'),
    el('div', {
      children: [
        el('span', { className: 'tp-chip', dataset: { sourceNodeId: 'n_9' } }),
        textNode(' x'),
      ],
    }),
  ])
  assert.equal(readPromptFromEditor(ed), 'top\n{{ai-canvas:edge:n_9}} x')
})

test('caret-anchor ZWSP 被过滤', () => {
  const ed = editor([textNode('a​b')])
  assert.equal(readPromptFromEditor(ed), 'ab')
})
