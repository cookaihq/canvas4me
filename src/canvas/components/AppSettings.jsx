import BasicSection from './AppSettings/BasicSection'

/**
 * AI Canvas 应用设置入口（集成到项目 SettingsModal）
 *
 * 浏览器媒体缓存由系统按需 LRU 自动管理(>80% 配额时淘汰最久未用项),
 * 不再暴露手动管理 UI:用户上传/生成的资源都是临时 URL,失效时自愈层
 * 自动从缓存重新上传(详见 src/canvas/utils/urlSelfHeal.js)。
 */
export default function AppSettings({ form, config }) {
  return (
    <div className="ai-canvas-settings-root">
      <BasicSection form={form} config={config} />
    </div>
  )
}
