/**
 * 通知相关 API
 *
 * 对应 ai-tools-api 的 /api/v1/notify/* 接口
 */

import apiClient from './client'

export const notifyApi = {
  /**
   * 获取可订阅事件列表
   * @param {object} options
   * @param {string} options.scopeType - 作用域类型（可选）
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<Array<{event_type: string, name: string, description: string, scope_types: string[], channels: string[]}>>}
   */
  listEvents: (options = {}, requestOptions = {}) => {
    const params = new URLSearchParams()
    if (options.scopeType) params.append('scope_type', options.scopeType)
    const queryString = params.toString()
    return apiClient.get(`/api/v1/notify/events/list${queryString ? `?${queryString}` : ''}`, requestOptions)
  },

  /**
   * 获取当前用户订阅列表
   * @param {object} options
   * @param {string} options.scopeType - 作用域类型（可选）
   * @param {string} options.scopeId - 作用域 ID（可选）
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<Array<object>>}
   */
  listSubscriptions: (options = {}, requestOptions = {}) => {
    const params = new URLSearchParams()
    if (options.scopeType) params.append('scope_type', options.scopeType)
    if (options.scopeId) params.append('scope_id', options.scopeId)
    const queryString = params.toString()
    return apiClient.get(`/api/v1/notify/subscriptions/list${queryString ? `?${queryString}` : ''}`, requestOptions)
  },

  /**
   * 批量更新订阅（upsert）
   * @param {Array<object>} items
   * @returns {Promise<void>}
   */
  updateSubscriptions: (items) =>
    apiClient.post('/api/v1/notify/subscriptions/update', { items }),

  /**
   * 站内信列表（分页）
   * @param {object} options
   * @param {string} options.scopeType - 作用域类型（可选）
   * @param {string} options.scopeId - 作用域 ID（可选）
   * @param {string} options.eventType - 事件类型（可选）
   * @param {string} options.sourceType - 来源类型（可选）
   * @param {string} options.sourceId - 来源 ID（可选）
   * @param {boolean} options.read - 是否已读（可选：true=已读 false=未读）
   * @param {number} options.page - 页码（默认 1）
   * @param {number} options.limit - 每页数量（默认 20）
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<{items:Array<object>, total:number, page:number, limit:number}>}
   */
  listInbox: (options = {}, requestOptions = {}) => {
    const params = new URLSearchParams()
    if (options.scopeType) params.append('scope_type', options.scopeType)
    if (options.scopeId) params.append('scope_id', options.scopeId)
    if (options.eventType) params.append('event_type', options.eventType)
    if (options.sourceType) params.append('source_type', options.sourceType)
    if (options.sourceId) params.append('source_id', options.sourceId)
    if (typeof options.read === 'boolean') params.append('read', String(options.read))
    if (Number.isFinite(options.page)) params.append('page', String(options.page))
    if (Number.isFinite(options.limit)) params.append('limit', String(options.limit))
    const queryString = params.toString()
    return apiClient.get(`/api/v1/notify/inbox/list${queryString ? `?${queryString}` : ''}`, requestOptions)
  },

  /**
   * 获取站内信未读数
   * @param {object} options
   * @param {string} options.scopeType - 作用域类型（可选）
   * @param {string} options.scopeId - 作用域 ID（可选）
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<number|{count:number}>}
   */
  getInboxUnreadCount: (options = {}, requestOptions = {}) => {
    const params = new URLSearchParams()
    if (options.scopeType) params.append('scope_type', options.scopeType)
    if (options.scopeId) params.append('scope_id', options.scopeId)
    const queryString = params.toString()
    return apiClient.get(`/api/v1/notify/inbox/unread_count${queryString ? `?${queryString}` : ''}`, requestOptions)
  },

  /**
   * 标记单条站内信已读
   * @param {number|string} notifyId
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<{message:string}>}
   */
  markInboxRead: (notifyId, requestOptions = {}) =>
    apiClient.post(`/api/v1/notify/inbox/${notifyId}/read`, {}, requestOptions),

  /**
   * 批量标记站内信已读
   * @param {object} payload
   * @param {string} payload.scope_type - 过滤：scope_type（可选）
   * @param {string} payload.scope_id - 过滤：scope_id（可选）
   * @param {string} payload.event_type - 过滤：event_type（可选）
   * @param {number} payload.before_id - 仅标记 id <= before_id（可选）
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<{count:number}>}
   */
  readAllInbox: (payload = {}, requestOptions = {}) =>
    apiClient.post('/api/v1/notify/inbox/read_all', payload, requestOptions),

  /**
   * 清除单条站内信（软删除）
   * @param {number|string} notifyId
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<{message:string}>}
   */
  clearInbox: (notifyId, requestOptions = {}) =>
    apiClient.post(`/api/v1/notify/inbox/${notifyId}/clear`, {}, requestOptions),

  /**
   * 批量清除站内信（软删除）
   * @param {Array<number|string>} notifyIds
   * @param {object} requestOptions - 额外请求选项（headers/signal 等）
   * @returns {Promise<{count:number}>}
   */
  clearInboxBatch: (notifyIds = [], requestOptions = {}) =>
    apiClient.post('/api/v1/notify/inbox/clear_batch', { notify_ids: notifyIds }, requestOptions),

  /**
   * 获取飞书 webhook（用户级）
   * @returns {Promise<{url?: string, secret?: string} | null>}
   */
  getFeishuWebhookDetail: () => apiClient.get('/api/v1/notify/feishu/webhook/detail'),

  /**
   * 测试飞书 webhook
   * @param {object} payload
   * @param {string} payload.title
   * @param {string} payload.text
   * @param {string|null} payload.url
   * @returns {Promise<void>}
   */
  testFeishuWebhook: (payload = {}) => apiClient.post('/api/v1/notify/feishu/webhook/test', payload),
}

export default notifyApi
