/**
 * Uploader 实现 — 走 foxapi 临时上传 (72h 失效)
 *
 * 实现 src/platform/interfaces/Uploader.js 契约。
 *
 * 上传策略:
 *   - foxapi `/v1/files/upload/stream` (multipart/form-data, auto_cleanup=72h)
 *   - 失败时直接抛错(画布禁止接 base64 兜底,避免大 JSON 写入画布数据)
 *
 * 失效保障:文件 72h 后会被 foxapi 清除,但浏览器 Cache API 里的 blob 仍在。
 * 用户提交节点时 useRunCapability 会发现 URL 失效,自动从缓存重新上传(URL 自愈),
 * 整个流程对用户透明。详见 src/canvas/utils/urlSelfHeal.js。
 */
import { settingsLocal } from './Settings.localStorage'
import { makeRandomFilename } from '@/utils/randomFilename'

// dev 走 Vite 代理（避免浏览器 CORS），prod 直连 foxapi
const FOXAPI_UPLOAD_ENDPOINT = import.meta.env.DEV
  ? '/foxapi/v1/files/upload/stream'
  : 'https://api.foxapi.cc/v1/files/upload/stream'

// 单文件上传上限 50MB。
// foxapi OpenAPI 未明确单文件上限，实际超过会被 cloudflare 网关返回 413
// （HTML body 含 "cloudflare" 字样，免费版默认 body 上限 100MB）。
// 这里保守取 50MB，避免触发 cloudflare 拦截以及 foxapi 服务端的潜在限制。
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function describeHttpError(status, bodyText) {
  // bodyText 可能是 cloudflare 整段 HTML，截断避免噪声
  const snippet = (bodyText || '').trim().slice(0, 120)
  switch (status) {
    case 401:
      return 'API Key 无效或已过期，请到 Settings → API Key 重新配置'
    case 402:
      return '账户余额不足，请到 foxapi.cc 充值'
    case 403:
      return '权限不足或 foxapi 存储空间已满（auto_cleanup=true 时不应出现，请联系 foxapi）'
    case 413:
      return `文件过大被网关拒绝（HTTP 413）。当前上限 ${formatMB(MAX_UPLOAD_SIZE)}`
    case 429:
      return '请求过于频繁，请稍后重试'
    case 500:
    case 502:
    case 503:
    case 504:
      return `foxapi 服务暂时不可用（HTTP ${status}），请稍后重试`
    default:
      return `foxapi 上传失败（HTTP ${status}）${snippet ? `: ${snippet}` : ''}`
  }
}

async function uploadViaFoxapi(file, apiKey) {
  if (!apiKey) {
    throw new Error('foxapi API Key 未配置，请到 Settings → API Key 填入')
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(
      `文件过大 (${formatMB(file.size)})，单文件上限 ${formatMB(MAX_UPLOAD_SIZE)}`,
    )
  }
  // 不把用户本地原始文件名传给上游：生成随机名（保留扩展名）作为存储侧的文件名。
  // 画布节点上展示的 fileName 仍使用本地原名（见下方 return）。
  const uploadName = makeRandomFilename(file.name)
  const formData = new FormData()
  formData.append('file', file, uploadName)
  formData.append('file_name', uploadName)
  formData.append('auto_cleanup', 'true')

  const resp = await fetch(FOXAPI_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(describeHttpError(resp.status, text))
  }
  const data = await resp.json()
  if (!data?.url) {
    throw new Error('foxapi 上传响应缺少 url 字段')
  }
  return {
    url: data.url,
    size: data.size || file.size,
    mimeType: file.type,
    // 节点显示用本地原名，上游返回的随机名只用于存储侧
    fileName: file.name,
  }
}

export const uploaderUserOss = {
  uploadFile: async (file, opts) => {
    const globalSettings = await settingsLocal.getGlobal()
    const apiKey = globalSettings?.foxapi?.apiKey || ''
    try {
      opts?.onProgress?.(20)
      const result = await uploadViaFoxapi(file, apiKey)
      opts?.onProgress?.(100)
      return result
    } catch (err) {
      const msg = err?.message || String(err)
      console.warn('[Uploader] foxapi 上传失败:', msg)
      // 错误消息已在底层做过友好化，直接透传
      throw new Error(msg)
    }
  },

  deleteFile: async (url) => {
    if (!url) return
    // 防御兜底: 历史画布若残留 data: URL, 不需要删, 静默返回
    if (url.startsWith('data:')) return
    if (url.includes('foxapi.cc')) {
      // foxapi auto_cleanup=true 自动 72h 清理,不需要前端主动删
      return
    }
    // 其他来源(如旧版本残留的 ali-oss URL)前端无凭证,不主动清理
    console.warn('[Uploader] 跳过非 foxapi URL 删除:', url)
  },
}
