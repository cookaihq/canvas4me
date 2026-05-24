/**
 * VoicePresets 本地实现 —— fetch 真连 foxapi,其他方法为 stub。
 *
 * fetch: 读 SimpleSettings 配置的 foxapi API Key,调 GET /v1/configs/minimax-preset-voice-id
 *        直接返回预设音色数组,模块级 Map 缓存 per language,失败清缓存确保可重试。
 *        未配置 Key 时抛中文 error 提示去 Settings 配置。
 *
 * 其他方法(listMyVoices / listFavoritedVoices / toggleFavorite / updateVoice / submitClone)
 * 为 stub —— 它们都依赖团队 / 后端,OSS 无此概念。
 *
 * 用户可改用 MiniMax 17 个通用预设字符串(如 `Wise_Woman` / `Friendly_Person`,
 * 详见 MiniMax 官方文档)或克隆音色 ID(`moss_audio_<uuid>`)手填到 voice_setting.voice_id。
 *
 * 调用方 VoiceSelector 捕获本错误后应给用户友好提示。
 */

import { settingsLocal } from './Settings.localStorage'

const FOXAPI_BASE = import.meta.env.DEV ? '/foxapi' : 'https://api.foxapi.cc'
const ENDPOINT = '/v1/configs/minimax-preset-voice-id'

// 模块级 Map 缓存: key = language, value = Promise<voices[]>
const presetCache = new Map()

async function getApiKey() {
  const g = await settingsLocal.getGlobal()
  const key = g?.foxapi?.apiKey
  if (!key) {
    throw new Error(
      '未配置 API Key —— 请在 Settings → API Key 填入 foxapi.cc 的 Key 后,刷新页面重试',
    )
  }
  return key
}

async function fetchVoicePresets(language = 'zh', opts = {}) {
  const lang = language === 'en' ? 'en' : 'zh'

  // 用户点刷新 → 失效该语言的缓存条目, 走下面的重新请求路径
  if (opts.force) {
    presetCache.delete(lang)
  }

  // 缓存命中 → 直接返回(即使 promise 还在 pending 也能避免并发重复请求)
  if (presetCache.has(lang)) {
    return presetCache.get(lang)
  }

  const apiKey = await getApiKey()

  // 包装 promise,失败时清缓存
  const promise = fetch(`${FOXAPI_BASE}${ENDPOINT}?language=${lang}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })
    .then(resp => {
      if (!resp.ok) {
        throw new Error(
          `foxapi GET ${ENDPOINT} 失败 (${resp.status}): ${resp.statusText}`,
        )
      }
      return resp.json()
    })
    .then(data => (Array.isArray(data) ? data : []))
    .catch(err => {
      // 请求失败 → 从 cache 删除该 entry,下次调用时能重试
      presetCache.delete(lang)
      throw err
    })

  presetCache.set(lang, promise)
  return promise
}

/** @type {import('@/platform/interfaces/VoicePresets').VoicePresets} */
export const voicePresetsLocal = {
  capabilities: { cloneVoices: false, favorites: false },
  fetch: fetchVoicePresets,
  listMyVoices: async () => {
    throw new Error('listMyVoices is not available in this build')
  },
  listFavoritedVoices: async () => {
    throw new Error('listFavoritedVoices is not available in this build')
  },
  toggleFavorite: async () => {
    throw new Error('toggleFavorite is not available in this build')
  },
  updateVoice: async () => {
    throw new Error('updateVoice is not available in this build')
  },
  submitClone: async () => {
    throw new Error('submitClone is not available in this build')
  },
}
