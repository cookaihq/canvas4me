/**
 * 全局事件总线
 * 用于跨组件通信，特别是工具函数触发 UI 事件
 */

// 事件类型常量
export const EVENTS = {
  OPEN_SETTINGS: 'open-settings',         // 打开设置弹窗
  OPEN_APP_SETTINGS: 'open-app-settings', // 打开应用设置
  NOTIFY_INBOX_UPDATED: 'notify-inbox-updated', // 站内信状态更新（已读/未读变化）
  TASK_UPDATED: 'task-updated',           // 任务更新（API 返回、转存完成等）
  TASK_CREATING: 'task-creating',         // 任务创建中（乐观更新）
  ADD_MATERIAL_TO_CANVAS: 'add-material-to-canvas', // 素材库预览 Modal 请求把素材加到画布视口中心
}

/**
 * 发射全局事件
 * @param {string} eventName - 事件名称
 * @param {any} detail - 事件详情数据
 */
export function emitEvent(eventName, detail = null) {
  const event = new CustomEvent(eventName, { detail })
  window.dispatchEvent(event)
  console.log(`📡 [EventBus] 发射事件: ${eventName}`, detail)
}

/**
 * 监听全局事件
 * @param {string} eventName - 事件名称
 * @param {Function} handler - 事件处理函数
 * @returns {Function} 取消监听函数
 */
export function onEvent(eventName, handler) {
  window.addEventListener(eventName, handler)
  console.log(`👂 [EventBus] 监听事件: ${eventName}`)

  // 返回取消监听函数
  return () => {
    window.removeEventListener(eventName, handler)
    console.log(`🔇 [EventBus] 取消监听: ${eventName}`)
  }
}

/**
 * 打开设置弹窗（快捷方法）
 * @param {string} defaultTab - 默认打开的设置页签
 * @param {string|null} appId - 可选：按应用维度打开设置
 */
export function openSettings(defaultTab = 'global', appId = null) {
  emitEvent(EVENTS.OPEN_SETTINGS, { defaultTab, ...(appId ? { appId } : {}) })
}

/**
 * 打开应用设置（快捷方法）
 * @param {string} appId - 应用 ID
 */
export function openAppSettings(appId) {
  if (!appId) return
  emitEvent(EVENTS.OPEN_APP_SETTINGS, { appId })
}

/**
 * 触发任务更新事件（快捷方法）
 * @param {number} taskId - 任务 ID
 * @param {string} type - 更新类型：'api_response' | 'transfer_success' | 'transfer_failed'
 * @param {Object} data - 额外数据（如临时图片 URL）
 */
export function notifyTaskUpdated(taskId, type = 'api_response', data = {}) {
  emitEvent(EVENTS.TASK_UPDATED, { taskId, type, ...data })
}

/**
 * 触发任务创建事件（快捷方法）
 * @param {Object} task - 临时任务对象（用于乐观更新）
 */
export function notifyTaskCreating(task) {
  emitEvent(EVENTS.TASK_CREATING, { task })
}
