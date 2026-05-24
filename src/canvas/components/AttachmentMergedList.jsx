import { Tooltip } from 'antd'
import { Lock } from '@/canvas/icons'
import { useMediaSource } from '../hooks/useMediaSource'

function AttachmentImage({ item }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'image' })
  return (
    <img
      src={displayUrl}
      alt={item.name || ''}
      className="attachment-merged-thumb"
      onError={markError}
    />
  )
}

/**
 * 合并展示"面板直传附件 + 端口连入附件"的列表
 *
 * 用于 multi 附件端口（如 LLM capability 的 image、file）：端口连线与面板上传可共存。
 *
 * 视觉规则：
 * - 面板直传：带「直传」tag，右侧 × 可删除
 * - 端口连入：不带 tag，右侧锁图标不可删，悬停显示「来自：{源节点 label}」
 *
 * @param {('image'|'file'|'audio'|'video')} kind - 附件类型
 * @param {Array} items - 合并后的附件条目。每项结构：
 *   { url, name, source: 'panel'|'edge', sourceLabel?: string }
 * @param {(index:number) => void} onRemovePanel - 删除面板直传附件（index 是在 panel 子集里的序号）
 */
export default function AttachmentMergedList({ kind, items, onRemovePanel }) {
  if (!items || items.length === 0) return null

  let panelIdx = -1

  return (
    <div className="attachment-merged-list">
      {items.map((item, i) => {
        const isPanel = item.source === 'panel'
        if (isPanel) panelIdx += 1
        const currentPanelIdx = isPanel ? panelIdx : -1
        return (
          <div key={`${item.source}-${i}`} className={`attachment-merged-item attachment-merged-item-${item.source}`}>
            {kind === 'image' && item.url && (
              <AttachmentImage item={item} />
            )}
            <span className="attachment-merged-name" title={item.name}>
              {item.name || '未命名'}
            </span>
            {isPanel ? (
              <>
                <span className="attachment-merged-tag">直传</span>
                <button
                  className="attachment-merged-remove"
                  onClick={() => onRemovePanel?.(currentPanelIdx)}
                  title="移除"
                >
                  x
                </button>
              </>
            ) : (
              <Tooltip title={`来自：${item.sourceLabel || '上游节点'}，需在画布上断开连线才能移除`}>
                <Lock className="attachment-merged-lock" size={12} />
              </Tooltip>
            )}
          </div>
        )
      })}
    </div>
  )
}
