import { test, expect } from 'vitest'
import { isHealableProbeResult, LOAD_ERROR_REASONS } from './urlCheck.js'

// 提交前的 URL 体检会跨域 HEAD 探测远端文件。能否自愈(从缓存重传)只应取决于
// "文件是否确实失效",而不是"浏览器这次能否跨域拿到它"。

test('探测成功不需要自愈', () => {
  expect(isHealableProbeResult({ ok: true, status: 200 })).toBe(false)
})

test('404(文件确实不存在)触发自愈', () => {
  expect(isHealableProbeResult({ ok: false, reason: LOAD_ERROR_REASONS.NOT_FOUND })).toBe(true)
})

test('403/401(签名过期/无权)触发自愈', () => {
  expect(isHealableProbeResult({ ok: false, reason: LOAD_ERROR_REASONS.FORBIDDEN })).toBe(true)
})

// 跨域被拦时 fetch 抛 TypeError,前端无法区分"跨域 / 断网 / DNS / 真失效",统一归为 unknown。
// 此时不能判它失效——文件可能完全正常,只是浏览器跨域拿不到,后端服务端取它无此限制。
test('跨域/网络模糊(unknown)不算可自愈失效', () => {
  expect(isHealableProbeResult({ ok: false, reason: LOAD_ERROR_REASONS.UNKNOWN })).toBe(false)
})

test('超时是瞬时故障,不当作失效自愈', () => {
  expect(isHealableProbeResult({ ok: false, reason: LOAD_ERROR_REASONS.TIMEOUT })).toBe(false)
})

test('5xx 服务端错误不当作失效自愈', () => {
  expect(isHealableProbeResult({ ok: false, reason: LOAD_ERROR_REASONS.SERVER_ERROR })).toBe(false)
})
