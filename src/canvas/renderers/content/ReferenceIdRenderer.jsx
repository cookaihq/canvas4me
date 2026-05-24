import { memo, useCallback } from 'react'
import { Tag, Tooltip, message } from 'antd'
import { Copy } from '@/canvas/icons'
import {
  REFERENCE_ID_LABELS,
  REFERENCE_ID_NAME_KEYS,
  REFERENCE_ID_VALUE_KEYS,
} from '../../constants/contentTypes'
import { getContentTypeColor, getContentTypeBgColor } from '../../utils/designTokens'

const STATUS_TAG = {
  idle:       { label: '待运行', color: 'default' },
  pending:    { label: '排队中', color: 'default' },
  processing: { label: '处理中', color: 'processing' },
  running:    { label: '处理中', color: 'processing' },
  done:       { label: '已完成', color: 'success' },
  error:      { label: '失败',   color: 'error' },
}

/**
 * 档案类输出渲染器(profile-id / voice-id / character-id)
 *
 * 视觉:
 * - 类型徽章(Profile/Voice/Character) + 状态徽章
 * - 主显档案名(name),副显 id 字符串 + 一键复制
 * - 不展示代表图(profile-id 是引用符号,展示代表图会模糊类型语义)
 *
 * data 形态约定:
 *   data.subType: 'profile-id' | 'voice-id' | 'character-id'
 *   data.content: { profile_id / voice_id / character_id, profile_name / voice_name / character_name }
 *   data.status:  'idle' | 'pending' | 'processing' | 'done' | 'error'
 */
function ReferenceIdRenderer({ data }) {
  const subType = data?.subType
  const content = data?.content || {}
  const nameKey = REFERENCE_ID_NAME_KEYS[subType]
  const valueKey = REFERENCE_ID_VALUE_KEYS[subType]
  const name = nameKey ? content[nameKey] : ''
  const idValue = valueKey ? content[valueKey] : ''
  const typeLabel = REFERENCE_ID_LABELS[subType] || 'Reference'
  const status = data?.status || 'idle'
  const statusInfo = STATUS_TAG[status] || STATUS_TAG.idle
  const accent = getContentTypeColor(subType)
  const bg = getContentTypeBgColor(subType)

  const handleCopy = useCallback((e) => {
    e.stopPropagation()
    if (!idValue) return
    navigator.clipboard.writeText(idValue).then(
      () => message.success('ID 已复制'),
      () => message.error('复制失败')
    )
  }, [idValue])

  return (
    <div
      className="renderer-reference-id"
      style={{ background: bg, borderColor: accent }}
    >
      <div className="renderer-reference-id-badges">
        <Tag
          className="renderer-reference-id-type-badge"
          style={{ background: accent, borderColor: accent, color: '#fff' }}
        >
          {typeLabel}
        </Tag>
        <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
      </div>

      <div className="renderer-reference-id-name">
        {name || <span className="renderer-placeholder">未命名档案</span>}
      </div>

      {idValue ? (
        <div className="renderer-reference-id-value nodrag" onClick={handleCopy}>
          <Tooltip title="点击复制 ID">
            <span className="renderer-reference-id-value-text">{idValue}</span>
          </Tooltip>
          <Copy className="renderer-reference-id-copy-icon" size={13} />
        </div>
      ) : (
        <div className="renderer-reference-id-value">
          <span className="renderer-placeholder">等待生成...</span>
        </div>
      )}
    </div>
  )
}

export default memo(ReferenceIdRenderer)
