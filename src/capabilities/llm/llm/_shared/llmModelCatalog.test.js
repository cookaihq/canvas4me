// src/capabilities/llm/llm/_shared/llmModelCatalog.test.js
// 运行: node --test src/capabilities/llm/llm/_shared/llmModelCatalog.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterModelsByMode,
  mergeModelLabels,
  parseModelLabelsEnv,
  getRequiredCapabilities,
  getModelMissingCapabilities,
} from './llmModelCatalog.js'

const FLAT = [
  { id: 'claude-opus-4-7', capabilities: ['text', 'vision', 'file'] },
  { id: 'gemini-3.5-flash', capabilities: ['text', 'vision', 'video', 'audio', 'file'] },
  { id: 'gpt-5.5', capabilities: ['text', 'vision'] },
]

test('filterModelsByMode: vision 只留含 vision 的', () => {
  const r = filterModelsByMode(FLAT, 'llm-vision')
  assert.deepEqual(r.map(m => m.id), ['claude-opus-4-7', 'gemini-3.5-flash', 'gpt-5.5'])
})

test('filterModelsByMode: audio 只留含 audio 的', () => {
  const r = filterModelsByMode(FLAT, 'llm-audio')
  assert.deepEqual(r.map(m => m.id), ['gemini-3.5-flash'])
})

test('filterModelsByMode: video 只留含 video 的', () => {
  const r = filterModelsByMode(FLAT, 'llm-video')
  assert.deepEqual(r.map(m => m.id), ['gemini-3.5-flash'])
})

test('filterModelsByMode: custom 等同 text（全部）', () => {
  assert.equal(filterModelsByMode(FLAT, 'llm-custom').length, 3)
  assert.equal(filterModelsByMode(FLAT, 'llm-text').length, 3)
})

test('filterModelsByMode: 未知 mode 返回全部', () => {
  assert.equal(filterModelsByMode(FLAT, 'wat').length, 3)
})

test('filterModelsByMode: 非数组输入返回空数组', () => {
  assert.deepEqual(filterModelsByMode(null, 'llm-text'), [])
})

test('mergeModelLabels: 有覆盖用覆盖，无覆盖兜底 id', () => {
  const overlay = { 'gpt-5.5': { label: 'GPT 5.5', badge: 'thinking', description: '通用' } }
  const r = mergeModelLabels(FLAT, overlay)
  assert.deepEqual(r[2], {
    name: 'gpt-5.5', label: 'GPT 5.5', badge: 'thinking', description: '通用',
    capabilities: ['text', 'vision'],
  })
  assert.deepEqual(r[0], {
    name: 'claude-opus-4-7', label: 'claude-opus-4-7', badge: '', description: '',
    capabilities: ['text', 'vision', 'file'],
  })
})

test('mergeModelLabels: 非数组输入返回空数组', () => {
  assert.deepEqual(mergeModelLabels(undefined, {}), [])
})

test('parseModelLabelsEnv: 合法 JSON', () => {
  assert.deepEqual(parseModelLabelsEnv('{"a":{"label":"A"}}'), { a: { label: 'A' } })
})

test('parseModelLabelsEnv: 非法/空 → 空对象', () => {
  assert.deepEqual(parseModelLabelsEnv('not json'), {})
  assert.deepEqual(parseModelLabelsEnv(''), {})
  assert.deepEqual(parseModelLabelsEnv(undefined), {})
})

test('getRequiredCapabilities: 文件连入 → file', () => {
  const groups = { image: [], video: [], audio: [], file: [{ url: 'x' }] }
  assert.deepEqual(getRequiredCapabilities(groups), ['file'])
})

test('getRequiredCapabilities: 图片连入 → vision', () => {
  const groups = { image: [{ url: 'x' }], video: [], audio: [], file: [] }
  assert.deepEqual(getRequiredCapabilities(groups), ['vision'])
})

test('getRequiredCapabilities: 图片+音频+文件 → vision/audio/file', () => {
  const groups = { image: [{ url: 'x' }], video: [], audio: [{ url: 'y' }], file: [{ url: 'z' }] }
  assert.deepEqual(getRequiredCapabilities(groups).sort(), ['audio', 'file', 'vision'])
})

test('getRequiredCapabilities: 视频链接也算 video', () => {
  const groups = { image: [], video: [], audio: [], file: [] }
  assert.deepEqual(getRequiredCapabilities(groups, ['https://youtu.be/abc']), ['video'])
})

test('getRequiredCapabilities: 空/缺省 → []', () => {
  assert.deepEqual(getRequiredCapabilities({}), [])
  assert.deepEqual(getRequiredCapabilities(null), [])
  assert.deepEqual(getRequiredCapabilities({ image: [] }, []), [])
})

test('getModelMissingCapabilities: 缺 file → [file]', () => {
  const model = { name: 'gpt-5.5', capabilities: ['text', 'vision'] }
  assert.deepEqual(getModelMissingCapabilities(model, ['file']), ['file'])
})

test('getModelMissingCapabilities: 全支持 → []', () => {
  const model = { name: 'gemini-3.5-flash', capabilities: ['text', 'vision', 'video', 'audio', 'file'] }
  assert.deepEqual(getModelMissingCapabilities(model, ['file', 'vision']), [])
})

test('getModelMissingCapabilities: capabilities 缺省 → 返回全部需求', () => {
  assert.deepEqual(getModelMissingCapabilities({ name: 'x' }, ['file']), ['file'])
  assert.deepEqual(getModelMissingCapabilities(null, ['vision']), ['vision'])
})

test('getModelMissingCapabilities: 无需求 → []', () => {
  const model = { name: 'gpt-5.5', capabilities: ['text'] }
  assert.deepEqual(getModelMissingCapabilities(model, []), [])
})
