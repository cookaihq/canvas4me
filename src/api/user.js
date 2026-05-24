/**
 * 用户相关 API
 *
 * 对应 ai-tools-api 的 /api/v1/user/* 接口
 */

import apiClient from './client'

export const userApi = {
  /**
   * 获取当前用户信息
   * @returns {Promise<{id, email, display_name, avatar_url, user_role, status, membership_type, default_team_id, created_at}>}
   */
  getProfile: () => apiClient.get('/api/v1/user/profile/get'),

  /**
   * 更新用户信息
   * @param {object} data - 更新数据
   * @param {string} data.display_name - 显示名称
   * @param {string} data.avatar_url - 头像 URL
   * @returns {Promise<User>}
   */
  updateProfile: (data) => apiClient.post('/api/v1/user/profile/update', data),

  /**
   * 修改密码
   * @param {string} oldPassword - 当前密码
   * @param {string} newPassword - 新密码
   */
  updatePassword: (oldPassword, newPassword) =>
    apiClient.post('/api/v1/user/password/update', {
      old_password: oldPassword,
      new_password: newPassword,
    }),

  /**
   * 设置默认团队
   * @param {string} teamId - 团队 ID
   */
  setDefaultTeam: (teamId) =>
    apiClient.post('/api/v1/user/default-team/update', { team_id: teamId }),

  /**
   * 获取用户个人设置
   * @returns {Promise<object>}
   */
  getSettings: () => apiClient.get('/api/v1/user/settings/detail'),

  /**
   * 更新用户个人设置
   * @param {string} settingKey - 设置键名
   * @param {any} settingValue - 设置值
   */
  updateSetting: (settingKey, settingValue) =>
    apiClient.post('/api/v1/user/settings/update', {
      setting_key: settingKey,
      setting_value: settingValue,
    }),

  /**
   * 删除用户个人设置
   * @param {string} settingKey - 设置键名
   */
  deleteSetting: (settingKey) =>
    apiClient.post('/api/v1/user/settings/delete', { setting_key: settingKey }),

  /**
   * 批量获取用户展示信息（user_name、avatar_url）
   * 仅返回当前工作空间（Team）内的成员
   * @param {string[]} userIds - 用户 ID 列表（1-100）
   * @param {object} options - 透传给 apiClient 的请求选项（如 signal/skipLog）
   * @returns {Promise<Array<{id: string, user_name: string, avatar_url: string | null}>>}
   */
  queryInfo: (userIds = [], options = {}) => {
    const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : []
    if (ids.length === 0) return Promise.resolve([])
    return apiClient.post('/api/v1/user/info/query', { user_ids: ids }, options)
  },
}

export default userApi
