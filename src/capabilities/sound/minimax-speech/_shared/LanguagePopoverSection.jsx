import { Select } from 'antd'
import { LANGUAGE_OPTIONS } from '../voice-presets'

/**
 * LANGUAGE 段 (popover 内)
 *
 * 控件: select (搜索) — 41 项语言提示
 * 提供给模型当前文本语言的提示, 提升识别准确率.
 */
export default function LanguagePopoverSection({ value, onChange }) {
  return (
    <div className="ms-dp-popover-section">
      <div className="ms-dp-popover-section-label">LANGUAGE</div>
      <Select
        className="ms-dp-language-select nodrag"
        value={value}
        onChange={onChange}
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        size="middle"
        options={LANGUAGE_OPTIONS.map(opt => ({
          value: opt.value,
          label: opt.label,
        }))}
        popupMatchSelectWidth={false}
        getPopupContainer={(trigger) => trigger.parentNode}
      />
    </div>
  )
}
