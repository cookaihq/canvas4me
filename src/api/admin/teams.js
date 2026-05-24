/**
 * 管理后台 - 团队相关 API
 */

import apiClient from '../client'

export const adminTeamApi = {
  /**
   * 获取团队应用权限
   * @param {string} teamId
   */
  listAppPermissions: (teamId) =>
    apiClient.get(`/api/v1/admin/teams/${teamId}/app-permissions/list`),

  /**
   * 授权团队应用权限
   * @param {string} teamId
   * @param {string[]} appIds
   */
  grantAppPermissions: (teamId, appIds) =>
    apiClient.post(`/api/v1/admin/teams/${teamId}/app-permissions/grant`, {
      app_ids: appIds,
    }),

  /**
   * 撤销团队应用权限
   * @param {string} teamId
   * @param {string} appId
   */
  revokeAppPermission: (teamId, appId) =>
    apiClient.post(`/api/v1/admin/teams/${teamId}/app-permissions/${appId}/revoke`),

  /**
   * 获取团队配置列表
   * @param {string} teamId
   * @param {string} scope
   */
  listTeamSettings: (teamId, scope) => {
    const qs = new URLSearchParams()
    if (scope) qs.append('scope', scope)
    const query = qs.toString()
    return apiClient.get(
      `/api/v1/admin/teams/${teamId}/settings/list${query ? `?${query}` : ''}`
    )
  },
}

export default adminTeamApi
