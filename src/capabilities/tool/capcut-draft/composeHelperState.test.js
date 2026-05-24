// src/capabilities/tool/capcut-draft/composeHelperState.test.js
// 运行: node --test src/capabilities/tool/capcut-draft/composeHelperState.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeHelperState } from './composeHelperState.js'

test('composeHelperState · enabled=false → {type: scan}（最高优先级，忽略 activeTask）', () => {
  const state = composeHelperState({
    enabled: false,
    loopResult: { status: 'online', health: { service: 'capcut_helper', version: '0.1.7' } },
    activeTask: { id: 'x', status: 'downloading', progress: 50 },
  })
  assert.deepEqual(state, { type: 'scan' })
})

test('composeHelperState · loopResult=null → {type: scan}（探测循环还没回首帧）', () => {
  const state = composeHelperState({
    enabled: true,
    loopResult: null,
    activeTask: null,
  })
  assert.deepEqual(state, { type: 'scan' })
})

test('composeHelperState · loopResult.status=offline + activeTask=null → {type: offline}', () => {
  const state = composeHelperState({
    enabled: true,
    loopResult: { status: 'offline' },
    activeTask: null,
  })
  assert.deepEqual(state, { type: 'offline' })
})

test('composeHelperState · loopResult.status=online + activeTask=null → {type: health, health}', () => {
  const health = { service: 'capcut_helper', version: '0.1.7', cors_allowed: true, has_update: false }
  const state = composeHelperState({
    enabled: true,
    loopResult: { status: 'online', health },
    activeTask: null,
  })
  assert.deepEqual(state, { type: 'health', health })
})

test('composeHelperState · activeTask 非 null + loopResult.status=online → {type: task, task}（task 优先于 health）', () => {
  const task = { id: 'abc', status: 'downloading', progress: 50, subtasks: [] }
  const state = composeHelperState({
    enabled: true,
    loopResult: { status: 'online', health: { service: 'capcut_helper', version: '0.1.7' } },
    activeTask: task,
  })
  assert.deepEqual(state, { type: 'task', task })
})

test('composeHelperState · activeTask 非 null + loopResult=offline → {type: task, task}（task 优先于 offline）', () => {
  const task = { id: 'abc', status: 'downloading', progress: 50, subtasks: [] }
  const state = composeHelperState({
    enabled: true,
    loopResult: { status: 'offline' },
    activeTask: task,
  })
  assert.deepEqual(state, { type: 'task', task })
})

test('composeHelperState · activeTask 非 null + loopResult=null → {type: task, task}（task 优先于 scan）', () => {
  const task = { id: 'abc', status: 'pending', progress: 0, subtasks: [] }
  const state = composeHelperState({
    enabled: true,
    loopResult: null,
    activeTask: task,
  })
  assert.deepEqual(state, { type: 'task', task })
})
