import { message, Modal } from 'antd'
import { decideImport } from './decideApiKeyImport.js'

/**
 * 从地址栏删除 apiKey 参数(其余参数如 canvasId 原样保留)。
 */
function clearApiKeyFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('apiKey')
  window.history.replaceState({}, '', url)
}

/**
 * 应用挂载时调一次:若 URL 带 ?apiKey=,按决策导入本地设置。
 *
 * 流程:
 *   1. 读 ?apiKey=。参数不存在 → 直接返回(不动地址栏)。
 *   2. 参数存在 → 立即清掉地址栏的 apiKey(避免 key 残留在历史/分享中)。
 *   3. 读本地 foxapi.apiKey,交给 decideImport 决策:
 *        write   → 直接写入 + toast
 *        confirm → 弹确认框,确认才写入 + toast
 *        skip    → 不处理
 *
 * @param {import('@/platform/interfaces/Settings.js').Settings} settings
 */
export async function importApiKeyFromUrl(settings) {
  if (typeof window === 'undefined') return

  const urlKey = new URLSearchParams(window.location.search).get('apiKey')
  if (urlKey === null) return // 参数不存在,什么都不做

  clearApiKeyFromUrl() // 参数存在即清地址栏,无论后续是否写入

  const globalSettings = await settings.getGlobal()
  const localKey = globalSettings?.foxapi?.apiKey || ''
  const decision = decideImport(urlKey, localKey)
  if (decision === 'skip') return

  const doWrite = async () => {
    const cur = await settings.getGlobal()
    await settings.updateGlobal({
      foxapi: { ...(cur?.foxapi || {}), apiKey: urlKey.trim() },
    })
    message.success('已导入 API Key')
  }

  if (decision === 'write') {
    await doWrite()
  } else {
    Modal.confirm({
      title: '检测到链接中的 API Key',
      content: '是否替换当前已配置的 Key?',
      okText: '替换',
      cancelText: '保留当前',
      onOk: doWrite,
    })
  }
}
