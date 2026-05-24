/**
 * 重试事件总线 — 在整个 ai-canvas 画布范围内广播"重试"信号
 *
 * 设计动机：一个画布中常有多个节点因同一原因（URL 过期 / CORS / 网络）同时失败，
 * 让用户为每个节点单独点"重试"体验很差。点任意一个"重试"按钮，广播此事件，
 * 所有处于错误态的 Renderer 订阅后各自重试，一键修复。
 *
 * 非订阅态的 Renderer（加载中 / 已成功）不受影响。
 */

const bus = new EventTarget()
const EVENT = 'retry-all'

/** 广播"重试所有失败节点" */
export function retryAllFailed() {
  bus.dispatchEvent(new Event(EVENT))
}

/**
 * 订阅"重试所有"事件
 * @param {() => void} handler 收到事件时的处理函数（通常是 Renderer 自己的 handleRetry）
 * @returns {() => void} 取消订阅的函数
 */
export function onRetryAll(handler) {
  bus.addEventListener(EVENT, handler)
  return () => bus.removeEventListener(EVENT, handler)
}
