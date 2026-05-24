import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@/index.css'

// 诊断兜底 — 必须在所有业务模块之前装载, 越早 patch console 越能捕获到完整面包屑
import { installConsoleBreadcrumbs } from '@/utils/consoleBreadcrumbs'
import { installGlobalErrorHandlers } from '@/utils/installGlobalErrorHandlers'
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary'
installConsoleBreadcrumbs()
installGlobalErrorHandlers()

// 触发所有 capability 的 register.js 把自己注入到画布注册中枢
import '@/capabilities'

// 装配 platform 接口的本地实现(无登录态)
import { PlatformProvider } from '@/platform/provider.jsx'
import { canvasStoreLocal } from '@/impl/CanvasStore.indexedDB'
import { taskClientFoxapi } from '@/impl/TaskClient.foxapi'
import { uploaderUserOss } from '@/impl/Uploader.userOss'
import { settingsLocal } from '@/impl/Settings.localStorage'
import { voicePresetsLocal } from '@/impl/VoicePresets.localOnly'

// foxapi 路由集中登记 —— 各 capability 在 foxapiRoutes.js 调 registerRoute()
// 把自己的路由登入 TaskClient.foxapi.js 内部 ROUTES Map。模块顶层执行,只需 import 一次。
import '@/impl/foxapiRoutes'

const platformImpl = {
  mode:          'oss',
  canvasStore:   canvasStoreLocal,
  taskClient:    taskClientFoxapi,
  uploader:      uploaderUserOss,
  settings:      settingsLocal,
  voicePresets:  voicePresetsLocal,
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <PlatformProvider impl={platformImpl}>
        <App />
      </PlatformProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>,
)
