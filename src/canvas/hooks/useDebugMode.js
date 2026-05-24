import { useEffect, useState } from 'react'
import { useSettings } from '@/platform/provider.jsx'

/**
 * 读取 ai-canvas app setting 中的 debugMode 开关
 *
 * 用于在节点 header / 面板 / 调试块等处条件渲染调试 UI
 * (输出按钮、原始 JSON 块等). 不强依赖任何画布状态, 任何组件都能用.
 *
 * 配置入口: SettingsModal → ai-canvas → BasicSection → debugMode 开关.
 *
 * @returns {boolean} 当前 debugMode 是否开启
 */
export default function useDebugMode() {
  const settings = useSettings()
  const [debugMode, setDebugMode] = useState(false)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await settings.getApp('ai-canvas')
        if (!cancelled) setDebugMode(s?.debugMode === true)
      } catch {
        if (!cancelled) setDebugMode(false)
      }
    }
    load()
    const off = settings.onChange?.(load)
    return () => {
      cancelled = true
      off?.()
    }
  }, [settings])
  return debugMode
}
