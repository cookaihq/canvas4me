/**
 * Settings 接口 — 用户偏好(主题、layout、OSS 凭证等)的存取
 *
 * 数据形态采用 **object** 而非 key-value(对齐现有 src/utils/config.js):
 *   - getApp(appId)  返回整个 settings 对象
 *   - updateApp(appId, partial) 接收 partial 对象做浅合并 patch
 *
 * 实现:
 *   - 本地实现: `impl/Settings.localStorage.js` (localStorage + key prefix)
 *
 * 注:这里管的是"用户偏好/团队偏好",不是 AppConfig(运营配置如 model_config)。
 * AppConfig 在 仅装饰层实现使用,本地实现没有运营配置概念。
 *
 * @typedef {object} GetOptions
 * @property {boolean} [force]   忽略缓存(装饰层 才有意义,本地 impl 忽略此参数)
 *
 * @typedef {(payload: { scope: 'global' | 'app', appId?: string }) => void} ChangeHandler
 *
 * @typedef {object} Settings
 * @property {(options?: GetOptions) => Promise<object>}                       getGlobal
 * @property {(updates: object) => Promise<void>}                              updateGlobal
 * @property {(appId: string, options?: GetOptions) => Promise<object>}        getApp
 * @property {(appId: string, updates: object) => Promise<void>}               updateApp
 * @property {(handler: ChangeHandler) => () => void}                          onChange
 *   订阅变更,返回 unsubscribe 函数。本地 impl 可用 storage event,装饰层 impl 用现有
 *   utils/config.js 的 onConfigChange。
 */

export {}
