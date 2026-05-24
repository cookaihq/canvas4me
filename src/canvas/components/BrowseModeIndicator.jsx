import { Eye } from '@/canvas/icons'
import useBrowseMode from '../hooks/useBrowseMode'

/**
 * 浏览模式状态徽章 —— 包裹右上角的设置触发 icon, 浏览模式开启时
 * 在被包裹元素左下角叠加一个小 eye icon, 作为视觉提示。
 *
 * 用法:
 *   <BrowseModeIndicator>
 *     <Button icon={<SettingOutlined />} />
 *   </BrowseModeIndicator>
 */
export default function BrowseModeIndicator({ children }) {
  const browseMode = useBrowseMode()
  return (
    <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}>
      {children}
      {browseMode && (
        <span
          aria-label="浏览模式已开启"
          title="浏览模式已开启"
          style={{
            position: 'absolute',
            left: -4,
            bottom: -4,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#1677ff',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            boxShadow: '0 0 0 1.5px #fff',
            pointerEvents: 'none',
          }}
        >
          <Eye size={12} />
        </span>
      )}
    </span>
  )
}
