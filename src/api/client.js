/**
 * 统一的 API 客户端 —— 调用自家后端 API 的唯一入口
 *
 * 功能：
 * 1. 自动拼接 VITE_API_BASE_URL 域名（生产环境必须，否则请求会发到前端页面域名）
 * 2. 自动添加 Authorization 和 X-Team-ID 请求头
 * 3. Token 过期自动刷新
 * 4. 统一的错误处理和请求/响应日志
 *
 * ⚠️ 所有调用自家后端（/api/...）的代码必须使用本客户端，不要直接使用 utils/request.js。
 *    utils/request.js 是底层工具，仅用于调用第三方外部 API（不需要拼域名和 Team ID 的场景）。
 */

import { tokenManager } from '../utils/tokenManager'
import { request } from '../utils/request'

// API 基础路径
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8171'
const LOGIN_PATH = '/login'
const AUTH_ERROR_CODES = new Set([10010, 10011])
const AUTH_ERROR_CODE_STRINGS = new Set(['AUTH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED'])

// 全局团队 ID（由 AppContext 设置）
let globalTeamId = null

function buildLoginRedirectUrl() {
  if (typeof window === 'undefined') return LOGIN_PATH
  const { pathname, search, hash } = window.location
  if (pathname.startsWith(LOGIN_PATH)) return LOGIN_PATH
  const redirectPath = `${pathname}${search}${hash}`
  const params = new URLSearchParams()
  params.set('redirect', redirectPath)
  return `${LOGIN_PATH}?${params.toString()}`
}

function handleAuthFailure(reason) {
  tokenManager.clear()
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason } }))
  const loginUrl = buildLoginRedirectUrl()
  if (!window.location.pathname.startsWith(LOGIN_PATH)) {
    window.location.replace(loginUrl)
  }
}

function isAuthTokenError(error) {
  if (!error) return false
  if (error.status === 401) return true
  const numericCode = typeof error.code === 'string' ? Number(error.code) : error.code
  if (AUTH_ERROR_CODES.has(numericCode)) return true
  if (AUTH_ERROR_CODE_STRINGS.has(error.code)) return true
  const dataCode = error.data?.error_code || error.data?.errorCode
  if (AUTH_ERROR_CODE_STRINGS.has(dataCode)) return true
  return false
}

/**
 * 设置全局团队 ID（供 AppContext 调用）
 * @param {string|null} teamId
 */
export function setGlobalTeamId(teamId) {
  globalTeamId = teamId
}

/**
 * 获取全局团队 ID
 * @returns {string|null}
 */
export function getGlobalTeamId() {
  return globalTeamId
}

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL
    this.refreshPromise = null // 防止并发刷新
  }

  /**
   * 发送请求
   * @param {string} endpoint - API 端点（如 /api/v1/user/profile/get）
   * @param {object} options - 请求选项
   * @param {string} options.method - 请求方法，默认 GET
   * @param {object} options.body - 请求体
   * @param {object} options.headers - 额外的请求头
   * @param {boolean} options.skipAuth - 跳过认证头，默认 false
   * @param {boolean} options.skipTeamId - 跳过团队 ID，默认 false
   * @param {boolean} options.skipLog - 跳过日志，默认 false
   * @param {AbortSignal} options.signal - 取消信号
   * @returns {Promise<any>} 响应数据（data 字段）
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      skipAuth = false,
      skipTeamId = false,
      skipLog = false,
      signal,
    } = options

    const url = `${this.baseUrl}${endpoint}`
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    }

    // 添加认证头
    if (!skipAuth) {
      let accessToken = tokenManager.getAccessToken()
      const refreshToken = tokenManager.getRefreshToken()

      if (!accessToken && refreshToken) {
        const refreshed = await this.refreshToken()
        if (refreshed) {
          accessToken = tokenManager.getAccessToken()
        } else {
          handleAuthFailure('refresh_failed')
          throw new Error('登录已过期，请重新登录')
        }
      }

      if (!accessToken && !refreshToken) {
        handleAuthFailure('missing_token')
        throw new Error('未登录，请先登录')
      }

      if (accessToken) {
        requestHeaders['Authorization'] = `Bearer ${accessToken}`
      }
    }

    // 添加团队 ID
    // - 优先使用 AppContext 设置的 globalTeamId
    // - 兜底使用本地缓存用户的 default_team_id，避免首屏 teamId 尚未初始化导致数据列表为空
    if (!skipTeamId) {
      const cachedUser = tokenManager.getUser()
      const teamId = globalTeamId || cachedUser?.default_team_id || cachedUser?.defaultTeamId
      if (teamId) {
        requestHeaders['X-Team-ID'] = teamId
      }
    }

    // 日志
    if (!skipLog) {
      console.group(`🌐 [API] ${method} ${endpoint}`)
      console.log('URL:', url)
      if (import.meta.env.DEV && method === 'POST') {
        const teamId = requestHeaders['X-Team-ID']
        const authorization = requestHeaders['Authorization']
        console.log('X-Team-ID:', teamId || '(none)')
        console.log('Token:', authorization || '(none)')
      }
      if (body) console.log('Body:', body)
      console.groupEnd()
    }

    try {
      let data
      let responseContentType = null
      try {
        data = await request(url, {
          method,
          headers: requestHeaders,
          body,
          signal,
          skipLog: false,
          expectApiResponse: true,
          onResponse: (response) => {
            responseContentType = response?.headers?.get?.('content-type') || null
          },
        })
      } catch (error) {
        const shouldRefresh = !skipAuth && isAuthTokenError(error)

        if (shouldRefresh) {
          console.log('[API] Token 失效，尝试刷新 Token...')
          const refreshed = await this.refreshToken()
          if (refreshed) {
            // 重试请求
            console.log('[API] Token 刷新成功，重试请求...')
            return this.request(endpoint, options)
          }

          // 刷新失败，触发登出
          console.log('[API] Token 刷新失败，触发登出')
          handleAuthFailure('refresh_failed')
          throw new Error('登录已过期，请重新登录')
        }
        throw error
      }

      if (!skipLog) {
        console.log(`✅ [API] ${method} ${endpoint} 成功`)
        console.log('✅ [API] Content-Type:', responseContentType || '(none)')
        console.log('✅ [API] Response:', data)
      }

      return data
    } catch (error) {
      // 网络错误或其他错误
      if (error.name === 'AbortError') {
        throw error
      }
      if (!error.status && !error.code) {
        console.error(`❌ [API] ${method} ${endpoint} 网络错误:`, error.message)
      }
      throw error
    }
  }

  /**
   * 刷新 Token
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshToken() {
    // 防止并发刷新
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    const refreshToken = tokenManager.getRefreshToken()
    if (!refreshToken) {
      console.log('[API] 没有 Refresh Token，无法刷新')
      return false
    }

    this.refreshPromise = (async () => {
      try {
        console.log('[API] 正在刷新 Token...')
        const data = await request(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { refresh_token: refreshToken },
          skipLog: false,
          expectApiResponse: true,
        })

        tokenManager.setAccessToken(data.access_token, data.expires_in)
        console.log('[API] Token 刷新成功')
        return true
      } catch (error) {
        console.error('[API] Token 刷新异常:', error.message)
        return false
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  /**
   * GET 请求
   */
  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' })
  }

  /**
   * POST 请求
   */
  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body })
  }

  /**
   * PUT 请求
   */
  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body })
  }

  /**
   * DELETE 请求
   */
  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' })
  }

  /**
   * 获取 API 基础路径
   */
  getBaseUrl() {
    return this.baseUrl
  }
}

export const apiClient = new ApiClient()
export default apiClient
