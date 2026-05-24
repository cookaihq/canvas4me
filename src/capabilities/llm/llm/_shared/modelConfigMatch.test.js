// 运行: node --test src/capabilities/llm/llm/_shared/modelConfigMatch.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchBestKey, applyLabelTemplate } from './modelConfigMatch.js'

const MAP = {
  'gpt-5.5': { label: 'GPT 5.5' },
  'gpt-*': { label: 'GPT *' },
  'gemini-3.5-*': { label: 'Gemini 3.5 *' },
  'gemini-*': { label: 'Gemini *' },
  '*': { label: '*' },
}

test('精确 id 优先于通配符', () => {
  assert.equal(matchBestKey(MAP, 'gpt-5.5').key, 'gpt-5.5')
})
test('最长通配符优先', () => {
  assert.equal(matchBestKey(MAP, 'gemini-3.5-flash').key, 'gemini-3.5-*')
  assert.equal(matchBestKey(MAP, 'gemini-2.0-pro').key, 'gemini-*')
})
test('* 兜底最后', () => {
  assert.equal(matchBestKey(MAP, 'llama-3').key, '*')
})
test('无任何匹配返回 null', () => {
  assert.equal(matchBestKey({ 'gpt-*': {} }, 'claude-x'), null)
})
test('applyLabelTemplate: * 捕获回填', () => {
  assert.equal(applyLabelTemplate('gpt-*', 'GPT *', 'gpt-5.5'), 'GPT 5.5')
  assert.equal(applyLabelTemplate('gemini-*', 'Gemini *', 'gemini-3.5-flash'), 'Gemini 3.5-flash')
})
test('applyLabelTemplate: 精确 key（无 *）原样返回模板', () => {
  assert.equal(applyLabelTemplate('gpt-5.5', 'GPT 5.5', 'gpt-5.5'), 'GPT 5.5')
})
test('applyLabelTemplate: 模板无 * 时原样（静态 label）', () => {
  assert.equal(applyLabelTemplate('gpt-*', 'GPT', 'gpt-5.5'), 'GPT')
})
