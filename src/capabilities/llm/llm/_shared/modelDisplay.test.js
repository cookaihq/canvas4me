// 运行: node --test src/capabilities/llm/llm/_shared/modelDisplay.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModelDisplay } from './modelDisplay.js'

test('通配符 label * 回填', () => {
  assert.equal(resolveModelDisplay('gpt-5.5').label, 'GPT 5.5')
  assert.equal(resolveModelDisplay('gemini-3.5-flash').label, 'Gemini 3.5-flash')
  assert.equal(resolveModelDisplay('claude-opus-4-7').label, 'Claude opus-4-7')
})
test('未匹配回退原始 id，badge/description 空', () => {
  const d = resolveModelDisplay('llama-3-70b')
  assert.equal(d.label, 'llama-3-70b')
  assert.equal(d.badge, '')
  assert.equal(d.description, '')
})
test('返回结构固定含 label/badge/description', () => {
  const d = resolveModelDisplay('gpt-5.5')
  assert.deepEqual(Object.keys(d).sort(), ['badge', 'description', 'label'])
})
