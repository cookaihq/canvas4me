/**
 * 用户/团队设置管理工具（Settings）
 *
 * ⚠️ 注意区分两套系统：
 * - Settings（本文件）：用户偏好设置（theme、layout_mode 等），存储在 settings API
 * - AppConfig（api/appConfig.js）：应用运营配置（model_config 等），存储在 apps 表 config 字段
 *
 * 使用 ai-tools-api 的 settings API 作为后端存储
 */

import {
  getGlobalSettings as _getGlobalSettings,
  setGlobalSettings as _setGlobalSettings,
  getAppSettings as _getAppSettings,
  setAppSettings as _setAppSettings,
  getAllSettings as _getAllSettings,
  clearAllConfig as _clearAllConfig,
  loadConfig as _loadConfig,
  onConfigChange as _onConfigChange,
} from '../services/configService'

const STORAGE_KEY = 'ai-tools-config'

// 默认设置
const DEFAULT_SETTINGS = {
  global: {
    oss: {
      accessKeyId: '',
      accessKeySecret: '',
      bucket: '',
      region: '',
      rootDir: '',
      customDomain: '',
      autoUpload: false,
    },
    imageProxy: {
      enabled: true,
    },
  },
  apps: {},
}

// ==================== 同步状态（兼容旧 API）====================

export const SYNC_STATUS = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  ERROR: 'error',
}

/**
 * 获取同步状态
 */
export const getSyncStatus = () => SYNC_STATUS.SYNCED

/**
 * 获取同步状态文本
 */
export const getSyncStatusText = () => '已同步'

/**
 * 监听同步状态变化
 */
export const onSyncStatusChange = (listener) => {
  // API 模式不需要同步状态监听
  return () => {}
}

// ==================== 设置操作 ====================

/**
 * 获取所有设置
 */
export const getSettings = async (options) => {
  const settings = await _getAllSettings(options)
  return {
    global: { ...DEFAULT_SETTINGS.global, ...settings.global },
    apps: settings.apps || {},
  }
}

/**
 * 获取全局设置
 */
export const getGlobalSettings = async (options) => {
  const globalSettings = await _getGlobalSettings(options)
  return { ...DEFAULT_SETTINGS.global, ...globalSettings }
}

/**
 * 获取全局设置（别名）
 */
export const getGlobalSettingsAsync = async (options) => {
  return getGlobalSettings(options)
}

/**
 * 更新全局设置
 */
export const updateGlobalSettings = async (updates) => {
  for (const [key, value] of Object.entries(updates)) {
    await _setGlobalSettings(key, value)
  }
  return getSettings()
}

/**
 * 更新全局设置（异步，返回操作结果）
 */
export const updateGlobalSettingsAsync = async (updates) => {
  try {
    for (const [key, value] of Object.entries(updates)) {
      await _setGlobalSettings(key, value)
    }
    return { saved: true, synced: true }
  } catch (error) {
    console.error('[Settings] 更新全局设置失败:', error)
    return { saved: false, synced: false, error: error.message }
  }
}

/**
 * 获取应用设置（用户/团队偏好）
 * 合并了团队设置和用户设置，用户设置优先级更高
 */
export const getAppSettings = async (appId, options) => {
  return (await _getAppSettings(appId, options)) || {}
}

/**
 * 更新应用设置
 */
export const updateAppSettings = async (appId, updates) => {
  for (const [key, value] of Object.entries(updates)) {
    await _setAppSettings(appId, key, value)
  }
  return getSettings()
}

/**
 * 获取应用设置（别名）
 */
export const getAppSettingsAsync = async (appId, options) => {
  return getAppSettings(appId, options)
}

/**
 * 获取应用配置（兼容旧 API）
 */
export const getAppConfig = async (appId, options) => {
  return getAppSettings(appId, options)
}

/**
 * 获取应用配置（异步，兼容旧 API）
 */
export const getAppConfigAsync = async (appId, options) => {
  return getAppSettings(appId, options)
}

/**
 * 更新应用设置（异步，返回操作结果）
 */
export const updateAppSettingsAsync = async (appId, updates) => {
  try {
    for (const [key, value] of Object.entries(updates)) {
      await _setAppSettings(appId, key, value)
    }
    return { saved: true }
  } catch (error) {
    console.error(`[Settings] 更新应用设置失败 (${appId}):`, error)
    return { saved: false, error: error.message }
  }
}

/**
 * 获取 OSS 配置
 */
export const getOSSConfig = async () => {
  const globalSettings = await getGlobalSettings()
  return globalSettings.oss || DEFAULT_SETTINGS.global.oss
}

/**
 * 获取 OSS 配置（异步）
 */
export const getOSSConfigAsync = async () => {
  return getOSSConfig()
}

/**
 * 检查 OSS 配置是否完整
 */
export const isOSSConfigured = async () => {
  const ossConfig = await getOSSConfig()
  return !!(
    ossConfig.accessKeyId &&
    ossConfig.accessKeySecret &&
    ossConfig.bucket &&
    ossConfig.region &&
    ossConfig.rootDir
  )
}

/**
 * 检查是否启用自动上传
 */
export const isAutoUploadEnabled = async () => {
  const ossConfig = await getOSSConfig()
  return ossConfig.autoUpload && await isOSSConfigured()
}

/**
 * OSS 配置脱敏
 */
export const maskOSSConfig = (ossConfig) => {
  if (!ossConfig) return ossConfig

  return {
    ...ossConfig,
    accessKeyId: ossConfig.accessKeyId
      ? `${ossConfig.accessKeyId.slice(0, 6)}****${ossConfig.accessKeyId.slice(-4)}`
      : '',
    accessKeySecret: ossConfig.accessKeySecret ? '****' : '',
  }
}

/**
 * 获取图片代理配置
 */
export const getImageProxyConfig = async () => {
  const globalSettings = await getGlobalSettings()
  const imageProxyConfig = globalSettings?.imageProxy && typeof globalSettings.imageProxy === 'object'
    ? globalSettings.imageProxy
    : {}
  return { ...DEFAULT_SETTINGS.global.imageProxy, ...imageProxyConfig }
}

/**
 * 检查图片代理是否启用
 */
export const isImageProxyEnabled = async () => {
  const proxyConfig = await getImageProxyConfig()
  return !!proxyConfig.enabled
}

// ==================== 兼容旧 API ====================

/**
 * 从服务端同步配置
 */
export const syncConfigFromServer = async () => {
  try {
    await _loadConfig()
    return { success: true }
  } catch (error) {
    console.error('[Settings] 加载设置失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 清除所有配置
 */
export const clearAllConfig = () => {
  _clearAllConfig()
}

/**
 * 监听配置变化
 */
export const onConfigChange = _onConfigChange

export default {
  getSettings,
  getGlobalSettings,
  getGlobalSettingsAsync,
  updateGlobalSettings,
  updateGlobalSettingsAsync,
  getAppSettings,
  getAppSettingsAsync,
  updateAppSettings,
  updateAppSettingsAsync,
  getOSSConfig,
  getOSSConfigAsync,
  isOSSConfigured,
  isAutoUploadEnabled,
  maskOSSConfig,
  getImageProxyConfig,
  isImageProxyEnabled,
  getSyncStatus,
  getSyncStatusText,
  onSyncStatusChange,
  syncConfigFromServer,
  clearAllConfig,
  onConfigChange,
  SYNC_STATUS,
}
