/**
 * 管理后台 - 用户相关 API
 */

import apiClient from '../client'

export const adminUserApi = {
  /**
   * 获取用户列表
   * @param {object} params
   * @param {number} params.page
   * @param {number} params.limit
   * @param {string} params.search
   * @param {string} params.status
   */
  list: (params = {}) => {
    const qs = new URLSearchParams()
    if (params.page) qs.append('page', params.page)
    if (params.limit) qs.append('limit', params.limit)
    if (params.search) qs.append('search', params.search)
    if (params.status) qs.append('status', params.status)
    const query = qs.toString()
    return apiClient.get(`/api/v1/admin/users/list${query ? `?${query}` : ''}`)
  },

  /**
   * 获取用户详情
   * @param {string} userId
   */
  getById: (userId) => apiClient.get(`/api/v1/admin/users/${userId}/detail`),

  /**
   * 创建用户
   * @param {object} data
   */
  create: (data) => apiClient.post('/api/v1/admin/users/create', data),

  /**
   * 更新用户
   * @param {string} userId
   * @param {object} data
   */
  update: (userId, data) =>
    apiClient.post(`/api/v1/admin/users/${userId}/update`, data),

  /**
   * 获取用户配置列表
   * @param {string} userId
   * @param {string} scope
   */
  listSettings: (userId, scope) => {
    const qs = new URLSearchParams()
    if (scope) qs.append('scope', scope)
    const query = qs.toString()
    return apiClient.get(
      `/api/v1/admin/users/${userId}/settings/list${query ? `?${query}` : ''}`
    )
  },

  /**
   * 更新用户配置
   * @param {string} userId
   * @param {object} data
   */
  updateSetting: (userId, data) =>
    apiClient.post(`/api/v1/admin/users/${userId}/settings/update`, data),

  /**
   * 删除用户配置
   * @param {string} userId
   * @param {object} data
   */
  deleteSetting: (userId, data) =>
    apiClient.post(`/api/v1/admin/users/${userId}/settings/delete`, data),

  /**
   * 删除用户指定应用配置
   * @param {string} userId
   * @param {object} data
   */
  deleteAppSettings: (userId, data) =>
    apiClient.post(`/api/v1/admin/users/${userId}/settings/app/delete`, data),
}

export default adminUserApi
