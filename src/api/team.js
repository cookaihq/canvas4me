/**
 * 团队相关 API
 *
 * 对应 ai-tools-api 的 /api/v1/teams/* 接口
 */

import apiClient from './client'

const DEFAULT_TTL_MS = 5 * 1000

let teamListCache = null
let teamListExpiresAt = 0
let teamListPromise = null

const teamAppsCache = new Map()
const teamAppsExpiresAt = new Map()
const teamAppsPromise = new Map()

if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    teamListCache = null
    teamListExpiresAt = 0
    teamListPromise = null
    teamAppsCache.clear()
    teamAppsExpiresAt.clear()
    teamAppsPromise.clear()
  })
}

export const teamApi = {
  /**
   * 获取当前用户的团队列表
   * @returns {Promise<Array<{id, name, description, team_type, owner_id, avatar_url, status, max_members, max_projects, quota, used_quota, member_role, joined_at, created_at}>>}
   */
  list: (options = {}) => {
    const { force = false, ttlMs = DEFAULT_TTL_MS } = options
    const now = Date.now()

    if (!force && teamListCache && teamListExpiresAt > now) {
      return Promise.resolve(teamListCache)
    }

    if (teamListPromise) {
      return teamListPromise
    }

    teamListPromise = apiClient
      .get('/api/v1/teams/list')
      .then((data) => {
        teamListCache = data
        teamListExpiresAt = Date.now() + ttlMs
        return data
      })
      .finally(() => {
        teamListPromise = null
      })

    return teamListPromise
  },

  /**
   * 创建团队
   * @param {string} name - 团队名称
   * @param {string} description - 团队描述（可选）
   * @returns {Promise<Team>}
   */
  create: (name, description) =>
    apiClient.post('/api/v1/teams/create', { name, description }),

  /**
   * 获取团队详情
   * @param {string} teamId - 团队 ID
   * @returns {Promise<Team>}
   */
  getById: (teamId) => apiClient.get(`/api/v1/teams/${teamId}/detail`),

  /**
   * 更新团队信息
   * @param {string} teamId - 团队 ID
   * @param {object} data - 更新数据
   * @param {string} data.name - 团队名称
   * @param {string} data.description - 团队描述
   * @param {string} data.avatar_url - 团队头像
   */
  update: (teamId, data) => apiClient.post(`/api/v1/teams/${teamId}/update`, data),

  /**
   * 删除团队
   * @param {string} teamId - 团队 ID
   */
  delete: (teamId) => apiClient.post(`/api/v1/teams/${teamId}/delete`),

  /**
   * 兑换码充值团队额度
   * @param {string} teamId - 团队 ID
   * @param {string} code - 兑换码
   * @returns {Promise<{team_id, code, quota_added, quota, used_quota}>}
   */
  redeem: (teamId, code) =>
    apiClient.post(`/api/v1/teams/${teamId}/redeem`, { code }),

  /**
   * 获取团队成员列表
   * @param {string} teamId - 团队 ID
   * @returns {Promise<Array<{id, team_id, user_id, member_role, status, added_by, joined_at, user?: {id, email, display_name, avatar_url}}>>}
   */
  getMembers: (teamId) => apiClient.get(`/api/v1/teams/${teamId}/members/list`),

  /**
   * 添加团队成员
   * @param {string} teamId - 团队 ID
   * @param {string} userId - 成员用户 ID
   * @param {string} role - 角色：admin | member
   */
  addMember: (teamId, userId, role = 'member') =>
    apiClient.post(`/api/v1/teams/${teamId}/members/add`, {
      user_id: userId,
      member_role: role,
    }),

  /**
   * 更新成员角色
   * @param {string} teamId - 团队 ID
   * @param {string} userId - 用户 ID
   * @param {string} role - 新角色：admin | member
   */
  updateMemberRole: (teamId, userId, role) =>
    apiClient.post(`/api/v1/teams/${teamId}/members/${userId}/update`, {
      member_role: role,
    }),

  /**
   * 移除团队成员
   * @param {string} teamId - 团队 ID
   * @param {string} userId - 用户 ID
   */
  removeMember: (teamId, userId) =>
    apiClient.post(`/api/v1/teams/${teamId}/members/${userId}/remove`),

  /**
   * 离开团队
   * @param {string} teamId - 团队 ID
   */
  leave: (teamId) => apiClient.post(`/api/v1/teams/${teamId}/leave`),

  /**
   * 获取团队可用应用列表
   * @param {string} teamId - 团队 ID
   * @returns {Promise<Array<{app_id, name, description, icon, granted_at}>>}
   */
  getApps: (teamId, options = {}) => {
    const { force = false, ttlMs = DEFAULT_TTL_MS } = options
    const now = Date.now()
    const cache = teamAppsCache.get(teamId)
    const expiresAt = teamAppsExpiresAt.get(teamId) || 0
    const inFlight = teamAppsPromise.get(teamId)

    if (!force && cache && expiresAt > now) {
      return Promise.resolve(cache)
    }

    if (inFlight) {
      return inFlight
    }

    const promise = apiClient
      .get(`/api/v1/teams/${teamId}/apps/list`)
      .then((data) => {
        teamAppsCache.set(teamId, data)
        teamAppsExpiresAt.set(teamId, Date.now() + ttlMs)
        return data
      })
      .finally(() => {
        teamAppsPromise.delete(teamId)
      })

    teamAppsPromise.set(teamId, promise)
    return promise
  },

  /**
   * 检查应用权限
   * @param {string} teamId - 团队 ID
   * @param {string} appId - 应用 ID
   * @returns {Promise<{has_permission: boolean, reason: string}>}
   */
  checkAppPermission: (teamId, appId) =>
    apiClient.get(`/api/v1/teams/${teamId}/apps/${appId}/permission/check`),

  /**
   * 获取团队消费记录
   * @param {string} teamId - 团队 ID
   * @param {object} params - 查询参数
   * @param {number} params.page - 页码，默认 1
   * @param {number} params.limit - 每页条数，默认 20
   * @returns {Promise<{items: Array, total: number, page: number, limit: number}>}
   */
  getBillingLogs: (teamId, params = {}) => {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return apiClient.get(`/api/v1/teams/${teamId}/billing-logs/list${qs ? `?${qs}` : ''}`)
  },

}

export default teamApi
