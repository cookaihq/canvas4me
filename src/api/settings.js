/**
 * 配置相关 API
 *
 * 对应 ai-tools-api 的配置接口：
 * - /api/v1/team/settings/* - 团队配置（通过 X-Team-ID）
 * - /api/v1/user/settings/* - 用户个人设置
 */

import apiClient from './client'

export const settingsApi = {
  // ==================== 团队配置 ====================

  /**
   * 获取团队配置
   * @param {string} scope - 作用域（可选，不传则获取所有）
   * @returns {Promise<object>}
   */
  getTeamSettings: (scope) => {
    const params = new URLSearchParams()
    if (scope) params.append('scope', scope)
    const queryString = params.toString()
    return apiClient.get(`/api/v1/team/settings/detail${queryString ? `?${queryString}` : ''}`)
  },

  /**
   * 更新团队配置
   * @param {string} scope - 作用域
   * @param {string} settingKey - 配置键名
   * @param {any} settingValue - 配置值
   * @returns {Promise<void>}
   */
  updateTeamSetting: (scope, settingKey, settingValue) =>
    apiClient.post('/api/v1/team/settings/update', {
      scope,
      setting_key: settingKey,
      setting_value: settingValue,
    }),

  /**
   * 删除团队配置
   * @param {string} scope - 作用域
   * @param {string} settingKey - 配置键名
   * @returns {Promise<void>}
   */
  deleteTeamSetting: (scope, settingKey) =>
    apiClient.post('/api/v1/team/settings/delete', {
      scope,
      setting_key: settingKey,
    }),

  // ==================== 用户个人设置 ====================

  /**
   * 获取用户个人设置
   * @param {string} scope - 作用域（可选，不传则获取所有）
   * @returns {Promise<object>}
   */
  getUserSettings: (scope) => {
    const params = new URLSearchParams()
    if (scope) params.append('scope', scope)
    const queryString = params.toString()
    return apiClient.get(`/api/v1/user/settings/detail${queryString ? `?${queryString}` : ''}`)
  },

  /**
   * 更新用户个人设置
   * @param {string} scope - 作用域
   * @param {string} settingKey - 设置键名
   * @param {any} settingValue - 设置值
   * @returns {Promise<void>}
   */
  updateUserSetting: (scope, settingKey, settingValue) =>
    apiClient.post('/api/v1/user/settings/update', {
      scope,
      setting_key: settingKey,
      setting_value: settingValue,
    }),

  /**
   * 删除用户个人设置
   * @param {string} scope - 作用域
   * @param {string} settingKey - 设置键名
   * @returns {Promise<void>}
   */
  deleteUserSetting: (scope, settingKey) =>
    apiClient.post('/api/v1/user/settings/delete', {
      scope,
      setting_key: settingKey,
    }),
}

export default settingsApi
