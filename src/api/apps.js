/**
 * 应用相关 API
 */
import apiClient from './client'
import { teamApi } from './team'

export const appsApi = {
  /**
   * 获取团队可用应用列表
   * @param {string} teamId - 团队 ID
   * @returns {Promise<Array<{app_id: string, name?: string, description?: string, icon?: string, granted_at?: string}>>}
   */
  list: (teamId, options) => {
    if (!teamId) {
      return Promise.reject(new Error('缺少 teamId'))
    }
    return teamApi.getApps(teamId, options)
  },

  /**
   * 获取应用访问配置
   * @param {string} appId - 应用 ID
   * @returns {Promise<{is_public: boolean, require_auth: boolean}>}
   */
  getAccessConfig: (appId, options = {}) =>
    apiClient.get(`/api/apps/v1/${appId}/access-config`, {
      skipAuth: true,
      skipTeamId: true,
      ...options,
    }),
}

export default appsApi
