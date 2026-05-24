/**
 * 配置服务
 *
 * 提供与现有 config API 兼容的接口
 * 内部使用 ai-tools-api 的配置接口
 */

import { settingsApi } from '../api/settings'
import { getGlobalTeamId } from '../api/client'

const DEFAULT_TTL_MS = 15 * 1000

/**
 * 配置服务类
 */
class ConfigService {
  constructor() {
    this.cache = new Map()
    this.inFlight = new Map()
    this.listeners = new Set()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify(payload) {
    for (const fn of this.listeners) {
      try { fn(payload) } catch { /* ignore */ }
    }
  }

  buildCacheKey(teamId) {
    return teamId || '__no_team__'
  }

  invalidateCache(teamId) {
    if (!teamId) {
      this.cache.clear()
      this.inFlight.clear()
      return
    }
    const cacheKey = this.buildCacheKey(teamId)
    this.cache.delete(cacheKey)
    this.inFlight.delete(cacheKey)
  }

  /**
   * 加载配置
   * 从 API 获取团队配置和用户设置
   */
  async loadConfig(options = {}) {
    const teamId = getGlobalTeamId()
    const cacheKey = this.buildCacheKey(teamId)
    const { force = false, ttlMs = DEFAULT_TTL_MS } = options

    const cached = this.cache.get(cacheKey)
    const now = Date.now()
    if (!force && cached && cached.expiresAt > now) {
      return cached.value
    }

    const inFlightPromise = this.inFlight.get(cacheKey)
    if (inFlightPromise) {
      return inFlightPromise
    }

    try {
      // 并行获取团队配置和用户设置
      const fetchPromise = Promise.all([
        teamId ? settingsApi.getTeamSettings().catch(() => ({})) : Promise.resolve({}),
        settingsApi.getUserSettings().catch(() => ({})),
      ]).then(([teamSettings, userSettings]) => {
        const parseSettings = (settings) => {
          const global = {}
          const apps = {}

          Object.entries(settings || {}).forEach(([compoundKey, value]) => {
            const [scope, key] = compoundKey.split(':', 2)
            if (!key) {
              return
            }
            const settingValue = value?.setting_value

            if (scope === 'global') {
              global[key] = settingValue
              return
            }

            if (!apps[scope]) {
              apps[scope] = {}
            }
            apps[scope][key] = settingValue
          })

          return { global, apps }
        }

        const teamParsed = parseSettings(teamSettings)
        const userParsed = parseSettings(userSettings)

        const mergedApps = { ...teamParsed.apps }

        Object.entries(userParsed.apps).forEach(([appId, config]) => {
          mergedApps[appId] = { ...(mergedApps[appId] || {}), ...config }
        })

        // 合并配置（用户设置优先级高于团队配置）
        const config = {
          global: {
            ...teamParsed.global,
            ...userParsed.global,
          },
          apps: mergedApps,
          _meta: {
            loadedAt: Date.now(),
            teamId,
          },
        }

        return config
      })

      this.inFlight.set(cacheKey, fetchPromise)
      const config = await fetchPromise

      this.cache.set(cacheKey, { value: config, expiresAt: Date.now() + ttlMs })
      return config
    } catch (error) {
      console.error('[ConfigService] 加载配置失败:', error.message)
      throw error
    } finally {
      if (this.inFlight.get(cacheKey)) {
        this.inFlight.delete(cacheKey)
      }
    }
  }

  /**
   * 强制刷新配置缓存
   */
  async refreshConfig() {
    return this.loadConfig({ force: true })
  }

  /**
   * 获取全局配置
   * @param {string} key - 配置键名（可选）
   * @param {object} options - 选项（可选）
   * @returns {any}
   */
  async getGlobalSettings(keyOrOptions, options) {
    const hasKey = typeof keyOrOptions === 'string'
    const key = hasKey ? keyOrOptions : undefined
    const resolvedOptions = hasKey ? options : keyOrOptions
    const config = await this.loadConfig(resolvedOptions)
    if (key) {
      return config.global?.[key]
    }
    return config.global || {}
  }

  /**
   * 设置全局配置
   * @param {string} key - 配置键名
   * @param {any} value - 配置值
   */
  async setGlobalSettings(key, value) {
    try {
      await settingsApi.updateUserSetting('global', key, value)
    } catch (error) {
      console.error('[ConfigService] 保存全局配置失败:', error.message)
    } finally {
      this.invalidateCache(getGlobalTeamId())
      this.notify({ scope: 'global' })
    }
  }

  /**
   * 获取应用配置
   * 合并了团队配置和用户配置，用户配置优先级更高（会覆盖同名的团队配置）
   * @param {string} appId - 应用 ID
   * @param {string} key - 配置键名（可选）
   * @param {object} options - 选项（可选）
   * @returns {any}
   */
  async getAppSettings(appId, keyOrOptions, options) {
    const hasKey = typeof keyOrOptions === 'string'
    const key = hasKey ? keyOrOptions : undefined
    const resolvedOptions = hasKey ? options : keyOrOptions
    const config = await this.loadConfig(resolvedOptions)
    const appConfig = config.apps?.[appId] || {}
    if (key) {
      return appConfig[key]
    }
    return appConfig
  }

  /**
   * 设置应用配置
   * @param {string} appId - 应用 ID
   * @param {string} key - 配置键名
   * @param {any} value - 配置值
   */
  async setAppSettings(appId, key, value) {
    try {
      await settingsApi.updateUserSetting(appId, key, value)
    } catch (error) {
      console.error('[ConfigService] 保存应用配置失败:', error.message)
    } finally {
      this.invalidateCache(getGlobalTeamId())
      this.notify({ scope: 'app', appId })
    }
  }

  /**
   * 获取完整配置
   * @param {object} options - 选项（可选）
   * @returns {object}
   */
  async getAllSettings(options) {
    return this.loadConfig(options)
  }

  /**
   * 清除所有配置
   */
  clearAllConfig() {
    console.log('[ConfigService] clearAllConfig 已废弃')
  }
}

export const configService = new ConfigService()

if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    configService.invalidateCache()
  })
}

// ==================== 导出 ====================

/**
 * 获取全局设置
 * @param {string} key - 设置键名（可选）
 * @returns {any}
 */
export function getGlobalSettings(keyOrOptions, options) {
  return configService.getGlobalSettings(keyOrOptions, options)
}

/**
 * 设置全局设置
 * @param {string} key - 设置键名
 * @param {any} value - 设置值
 */
export async function setGlobalSettings(key, value) {
  await configService.setGlobalSettings(key, value)
}

/**
 * 获取应用设置（用户/团队偏好）
 * 合并了团队设置和用户设置，用户设置优先级更高（会覆盖同名的团队设置）
 * @param {string} appId - 应用 ID
 * @param {string} key - 设置键名（可选）
 * @returns {any}
 */
export function getAppSettings(appId, keyOrOptions, options) {
  return configService.getAppSettings(appId, keyOrOptions, options)
}

/**
 * 设置应用设置
 * @param {string} appId - 应用 ID
 * @param {string} key - 设置键名
 * @param {any} value - 设置值
 */
export async function setAppSettings(appId, key, value) {
  await configService.setAppSettings(appId, key, value)
}

/**
 * 获取完整设置
 * @returns {object}
 */
export function getAllSettings(options) {
  return configService.getAllSettings(options)
}

/**
 * 清除所有配置
 */
export function clearAllConfig() {
  configService.clearAllConfig()
}

/**
 * 加载配置
 */
export async function loadConfig() {
  return configService.loadConfig()
}

/**
 * 添加配置变更监听器
 * @param {function} listener
 * @returns {function}
 */
export function onConfigChange(listener) {
  return configService.subscribe(listener)
}

// 兼容旧的同步函数名
export const syncConfigFromServer = loadConfig

export default configService
