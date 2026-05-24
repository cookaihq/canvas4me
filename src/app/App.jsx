import { useCallback, useEffect, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { Settings } from '@/canvas/icons'
import AiCanvas from '@/canvas/index.jsx'
import BrowseModeIndicator from '@/canvas/components/BrowseModeIndicator'
import SimpleSettings from './SimpleSettings'
import { useSettings } from '@/platform/provider.jsx'
import { importApiKeyFromUrl } from './importApiKeyFromUrl'

const GITHUB_REPO_URL = 'https://github.com/cookaihq/canvas4me'

// GitHub 标记图标 —— 实心 SVG,fill 跟随 currentColor,自动适配主题/背景色。
const GithubMarkIcon = ({ size = 18 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

/**
 * 应用根组件 —— 直接渲染 <AiCanvas /> + <SimpleSettings />,通过 onOpenSettings 关联。
 *
 * readonly 留空 → 画布默认 isEditing=true(本地模式无协作锁,永远可编辑)。
 * topRightSlot 注入设置 icon(打开 SimpleSettings)。
 * brandExtra 注入 GitHub 仓库入口(挂在左上角 logo 右边,新页签打开)。
 */
export default function App() {
  const settings = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // settings 为模块级单例,引用稳定 → effect 仅挂载时跑一次。函数本身幂等
  // (首次清掉地址栏 apiKey 后,重跑读到 null 直接返回)。
  useEffect(() => {
    importApiKeyFromUrl(settings).catch((err) => console.warn('[apiKey 链接导入]', err))
  }, [settings])

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])

  const settingsTrigger = (
    <BrowseModeIndicator>
      <Tooltip title="设置" placement="bottom">
        <Button
          type="text"
          size="small"
          shape="circle"
          icon={<Settings size={16} />}
          onClick={handleOpenSettings}
        />
      </Tooltip>
    </BrowseModeIndicator>
  )

  const githubLink = (
    <Tooltip title="GitHub 仓库" placement="bottom">
      <a
        className="ai-canvas-brand-link"
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub repository"
      >
        <GithubMarkIcon size={18} />
      </a>
    </Tooltip>
  )

  return (
    <>
      <AiCanvas
        onOpenSettings={handleOpenSettings}
        topRightSlot={settingsTrigger}
        brandExtra={githubLink}
      />
      <SimpleSettings open={settingsOpen} onClose={handleCloseSettings} />
    </>
  )
}
