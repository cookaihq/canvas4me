/**
 * PlatformProvider — 把 4 个底座接口的具体实现注入给画布层。
 *
 * 用法:
 *   // 应用入口(如 main.jsx)
 *   <PlatformProvider impl={{ canvasStore, taskClient, uploader, settings }}>
 *     <App />
 *   </PlatformProvider>
 *
 *   // canvas/ 内部
 *   const taskClient = useTaskClient()
 *   const result = await taskClient.submitCapability({ ... })
 *
 * Step 2.2 阶段画布暂未切到这里调用 (双轨保留旧 import 路径),Provider 已就位等
 * Step 2.3a/b 切换。
 */
import { createContext, useContext } from 'react'

const PlatformContext = createContext(null)

export function PlatformProvider({ impl, children }) {
  if (!impl) throw new Error('[PlatformProvider] `impl` prop is required')
  return <PlatformContext.Provider value={impl}>{children}</PlatformContext.Provider>
}

function usePlatform() {
  const impl = useContext(PlatformContext)
  if (!impl) throw new Error('[platform] no PlatformProvider in tree')
  return impl
}

/** @returns {import('./interfaces/CanvasStore').CanvasStore} */
export const useCanvasStore = () => usePlatform().canvasStore

/** @returns {import('./interfaces/TaskClient').TaskClient} */
export const useTaskClient = () => usePlatform().taskClient

/** @returns {import('./interfaces/Uploader').Uploader} */
export const useUploader = () => usePlatform().uploader

/** @returns {import('./interfaces/Settings').Settings} */
export const useSettings = () => usePlatform().settings

/** @returns {import('./interfaces/VoicePresets').VoicePresets} */
export const useVoicePresets = () => usePlatform().voicePresets

/**
 * 平台构建模式 —— 由各入口 platformImpl 注入的运行时枚举值。
 * capability 用它判断当前模式下是否渲染禁用占位(如 midjourney / image-upscale 在
 * 上游 API 暂无端点时)。缺失时返回 undefined。
 *
 * @returns {string | undefined}
 */
export const usePlatformMode = () => usePlatform().mode
