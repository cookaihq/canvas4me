/**
 * decideImport 单测
 * 运行: node --test src/app/decideApiKeyImport.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideImport } from './decideApiKeyImport.js'

test('url 为空/空白/缺失 → skip', () => {
  assert.equal(decideImport('', 'sk-local'), 'skip')
  assert.equal(decideImport('   ', 'sk-local'), 'skip')
  assert.equal(decideImport(undefined, ''), 'skip')
})

test('url 有值、本地为空 → write', () => {
  assert.equal(decideImport('sk-new', ''), 'write')
  assert.equal(decideImport('sk-new', '   '), 'write')
})

test('url 与本地相同(忽略首尾空白) → skip', () => {
  assert.equal(decideImport('sk-same', 'sk-same'), 'skip')
  assert.equal(decideImport('  sk-same  ', 'sk-same'), 'skip')
})

test('url 与本地不同 → confirm', () => {
  assert.equal(decideImport('sk-new', 'sk-old'), 'confirm')
})
