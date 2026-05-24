/**
 * 应用配置中心
 *
 * 独立项目下只保留 ai-canvas 单应用,apps.js 保留主要是为了兼容
 * SettingsModal / configSync 等既有共享模块对 allApps 的引用。
 */

const apps = [
  {
    id: 'ai-canvas',
    name: 'canvas4me',
    description: '无限画布节点编排,可视化 AI 工作流',
    icon: '🎨',
    path: '/',
    requireAuth: false,
    component: () => import('../canvas/index.jsx')
  }
]

export const allApps = apps
export const visibleApps = apps
export default apps

// 保留兼容导出(某些模块可能引用)
export const getAppById = (id) => apps.find((a) => a.id === id)
