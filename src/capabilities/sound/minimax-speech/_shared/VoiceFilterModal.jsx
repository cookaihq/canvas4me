import { useState, useMemo } from 'react'
import { Select, Button } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'

const AGE_OPTIONS = ['青年', '成年', '儿童', '老年']
const GENDER_OPTIONS = [
  { label: '全部', value: '全部' },
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
]

/**
 * 语音过滤器弹窗 (原型 L2SCc)
 *
 * 4 个过滤字段:
 *   - 语言: select (可清空, 从 voices 数组动态生成)
 *   - 口音: select (可清空, 从 voices 数组动态生成)
 *   - 性别: select (固定 3 项: 全部/Male/Female)
 *   - 年龄: chips 多选 (固定 4 项: 青年/成年/儿童/老年)
 *
 * 底部按钮:
 *   - 重置参数: 清空所有 4 字段
 *   - 筛选: apply filter + close modal
 */
export default function VoiceFilterModal({
  open,
  initialValue = {},
  voices = [],
  onClose,
  onApply,
}) {
  const [language, setLanguage] = useState(initialValue.language)
  const [accent, setAccent] = useState(initialValue.accent)
  const [gender, setGender] = useState(initialValue.gender ?? '全部')
  const [ageList, setAgeList] = useState(initialValue.ageList ?? [])

  // 从 voices 数组动态生成 language 选项 (去重, 过滤 null/空字符串)
  const languageOptions = useMemo(() => {
    const langs = new Set()
    voices.forEach(v => {
      if (v.language && v.language.trim()) {
        langs.add(v.language)
      }
    })
    return Array.from(langs).sort()
  }, [voices])

  // 从 voices 数组动态生成 accent 选项 (去重, 过滤 null/空字符串)
  const accentOptions = useMemo(() => {
    const accents = new Set()
    voices.forEach(v => {
      if (v.accent && v.accent.trim()) {
        accents.add(v.accent)
      }
    })
    return Array.from(accents).sort()
  }, [voices])

  const handleReset = () => {
    setLanguage(undefined)
    setAccent(undefined)
    setGender('全部')
    setAgeList([])
  }

  const handleApply = () => {
    // 构造返回对象: 仅包含真正设置了的字段 (undefined / '全部' / [] 的字段不返回)
    const filter = {}
    if (language !== undefined) filter.language = language
    if (accent !== undefined) filter.accent = accent
    if (gender && gender !== '全部') filter.gender = gender
    if (ageList.length > 0) filter.ageList = ageList

    onApply?.(filter)
    onClose?.()
  }

  const handleAgeChange = (age) => {
    setAgeList(prev =>
      prev.includes(age)
        ? prev.filter(a => a !== age)
        : [...prev, age]
    )
  }

  return (
    <Modal
      open={open}
      title="语音过滤器"
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={handleReset}>
          重置参数
        </Button>,
        <Button key="apply" type="primary" onClick={handleApply}>
          筛选
        </Button>,
      ]}
      width={480}
      destroyOnHidden
      className="ms-voice-filter-modal"
    >
      <div className="ms-voice-filter-body">
        {/* 语言 */}
        <div className="ms-voice-filter-field">
          <div className="ms-voice-filter-label">语言</div>
          <Select
            placeholder="选择语言"
            value={language || undefined}
            onChange={setLanguage}
            allowClear
            options={languageOptions.map(lang => ({ label: lang, value: lang }))}
            className="ms-voice-filter-select"
          />
        </div>

        {/* 口音 */}
        <div className="ms-voice-filter-field">
          <div className="ms-voice-filter-label">口音</div>
          <Select
            placeholder="选择口音"
            value={accent || undefined}
            onChange={setAccent}
            allowClear
            options={accentOptions.map(a => ({ label: a, value: a }))}
            className="ms-voice-filter-select"
          />
        </div>

        {/* 性别 */}
        <div className="ms-voice-filter-field">
          <div className="ms-voice-filter-label">性别</div>
          <Select
            value={gender}
            onChange={setGender}
            options={GENDER_OPTIONS}
            className="ms-voice-filter-select"
          />
        </div>

        {/* 年龄 (chips, 占整行) */}
        <div className="ms-voice-filter-field ms-voice-filter-field-age">
          <div className="ms-voice-filter-label">年龄</div>
          <div className="ms-voice-filter-age-chips">
            {AGE_OPTIONS.map(age => (
              <button
                key={age}
                type="button"
                className={`ms-voice-filter-age-chip${ageList.includes(age) ? ' selected' : ''}`}
                onClick={() => handleAgeChange(age)}
              >
                {age}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
