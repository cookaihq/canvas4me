import { useEffect, useState } from 'react'
import { useSettings } from '@/platform/provider.jsx'

/**
 * 读取 ai-canvas app setting 中的 browseMode 开关
 *
 * 浏览模式 = 选中能力节点时不弹出底部 DockedPanel, 用于"只看不编辑"场景.
 * 配置入口: SettingsModal/SimpleSettings → ai-canvas → BasicSection → 浏览模式.
 *
 * @returns {boolean} 当前 browseMode 是否开启
 */
export default function useBrowseMode() {
  const settings = useSettings()
  const [browseMode, setBrowseMode] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await settings.getApp('ai-canvas')
        if (!cancelled) setBrowseMode(s?.browseMode === true)
      } catch {
        if (!cancelled) setBrowseMode(false)
      }
    }
    load()
    const off = settings.onChange?.(load)
    return () => {
      cancelled = true
      off?.()
    }
  }, [settings])
  return browseMode
}
