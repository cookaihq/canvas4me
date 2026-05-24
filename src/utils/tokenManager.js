/**
 * Token 存储和管理
 *
 * 存储结构：
 * localStorage['ai-tools-auth'] = {
 *   access_token: string,
 *   refresh_token: string,
 *   expires_at: number,  // access_token 过期时间戳
 *   user: object,        // 用户信息缓存
 * }
 */

const STORAGE_KEY = 'ai-tools-auth'

class TokenManager {
  constructor() {
    this.cache = this._loadFromStorage()
  }

  _loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : {}
    } catch (e) {
      console.error('[TokenManager] 加载存储失败:', e)
      return {}
    }
  }

  _saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache))
    } catch (e) {
      console.error('[TokenManager] 保存存储失败:', e)
    }
  }

  /**
   * 设置 Token（登录/注册成功后调用）
   * @param {string} accessToken - Access Token
   * @param {string} refreshToken - Refresh Token
   * @param {number} expiresIn - 过期时间（秒），默认 7200
   */
  setTokens(accessToken, refreshToken, expiresIn = 7200) {
    this.cache.access_token = accessToken
    this.cache.refresh_token = refreshToken
    this.cache.expires_at = Date.now() + expiresIn * 1000
    this._saveToStorage()
    console.log('[TokenManager] Token 已保存，过期时间:', new Date(this.cache.expires_at).toLocaleString())
  }

  /**
   * 更新 Access Token（刷新后调用）
   * @param {string} accessToken - 新的 Access Token
   * @param {number} expiresIn - 过期时间（秒），默认 7200
   */
  setAccessToken(accessToken, expiresIn = 7200) {
    this.cache.access_token = accessToken
    this.cache.expires_at = Date.now() + expiresIn * 1000
    this._saveToStorage()
    console.log('[TokenManager] Access Token 已更新')
  }

  /**
   * 获取 Access Token
   * 如果 Token 即将过期（60秒内），返回 null 触发刷新
   * @returns {string|null}
   */
  getAccessToken() {
    // 检查是否过期（提前 60 秒）
    if (this.cache.expires_at && Date.now() > this.cache.expires_at - 60000) {
      console.log('[TokenManager] Access Token 即将过期，需要刷新')
      return null
    }
    return this.cache.access_token || null
  }

  /**
   * 获取 Refresh Token
   * @returns {string|null}
   */
  getRefreshToken() {
    return this.cache.refresh_token || null
  }

  /**
   * 设置用户信息缓存
   * @param {object} user - 用户信息
   */
  setUser(user) {
    this.cache.user = user
    this._saveToStorage()
  }

  /**
   * 获取缓存的用户信息
   * @returns {object|null}
   */
  getUser() {
    return this.cache.user || null
  }

  /**
   * 清除所有认证信息（登出时调用）
   */
  clear() {
    this.cache = {}
    localStorage.removeItem(STORAGE_KEY)
    console.log('[TokenManager] 认证信息已清除')
  }

  /**
   * 检查是否已登录
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!(this.getAccessToken() || this.getRefreshToken())
  }

  /**
   * 获取 Token 过期时间
   * @returns {number|null} 过期时间戳
   */
  getExpiresAt() {
    return this.cache.expires_at || null
  }

  /**
   * 检查 Token 是否需要刷新
   * @returns {boolean}
   */
  needsRefresh() {
    if (!this.cache.expires_at) return false
    // 提前 5 分钟刷新
    return Date.now() > this.cache.expires_at - 5 * 60 * 1000
  }
}

export const tokenManager = new TokenManager()
export default tokenManager
