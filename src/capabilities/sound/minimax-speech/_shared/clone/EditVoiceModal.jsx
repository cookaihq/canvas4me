import { useEffect, useMemo, useState, useCallback } from 'react'
import { Form, Input, Select, message, Button } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'

import { Plus, X } from '@/canvas/icons'
import { useVoicePresets } from '@/platform/provider.jsx'

/**
 * 编辑克隆音色弹窗 — 原型 j3gSAp
 *
 * 7 字段对应 PATCH /api/apps/ai-canvas/v1/sound/minimax-voice-clone/voice/{voice_id}:
 *   voice_name / language / accent / gender / age / description / tag_list
 *
 * dirty tracking:用户改了什么字段才放入 PATCH body,避免覆盖未改字段。
 *
 * 标签 chips 参考 _shared/AdvancedSection.jsx 的 PronunciationDictBlock —
 * chip + 添加按钮 + Enter/失焦提交。
 *
 * Props:
 *   open: boolean
 *   voice: VoiceCloneItem | null
 *   onClose: () => void
 *   onSuccess: (updatedVoice: VoiceCloneItem) => void
 */

const GENDER_OPTIONS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
]

const AGE_OPTIONS = [
  { label: '儿童', value: '儿童' },
  { label: '青年', value: '青年' },
  { label: '成年', value: '成年' },
  { label: '老年', value: '老年' },
]

// 把字段值规范化成可比较的形态(null/undefined → '' / [])
function normStr(v) {
  return v == null ? '' : String(v)
}
function normList(v) {
  return Array.isArray(v) ? v : []
}

export default function EditVoiceModal({ open, voice, onClose, onSuccess }) {
  const voicePresets = useVoicePresets()

  const [voiceName, setVoiceName] = useState('')
  const [language, setLanguage] = useState('')
  const [accent, setAccent] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [description, setDescription] = useState('')
  const [tagList, setTagList] = useState([])

  const [saving, setSaving] = useState(false)

  // 用 voice 当前值初始化(每次 open 切换或 voice 变化都重置)
  useEffect(() => {
    if (!open || !voice) return
    setVoiceName(normStr(voice.voice_name))
    setLanguage(normStr(voice.language))
    setAccent(normStr(voice.accent))
    setGender(normStr(voice.gender))
    setAge(normStr(voice.age))
    setDescription(normStr(voice.description))
    setTagList(normList(voice.tag_list))
  }, [open, voice])

  // dirty patch:逐字段对比初始值,只把改过的塞进去
  const dirtyPatch = useMemo(() => {
    if (!voice) return {}
    const patch = {}
    if (voiceName !== normStr(voice.voice_name)) patch.voice_name = voiceName
    if (language !== normStr(voice.language)) patch.language = language
    if (accent !== normStr(voice.accent)) patch.accent = accent
    if (gender !== normStr(voice.gender)) patch.gender = gender
    if (age !== normStr(voice.age)) patch.age = age
    if (description !== normStr(voice.description)) patch.description = description
    // tag_list 用 JSON 序列化比较顺序与内容
    const origTags = normList(voice.tag_list)
    if (JSON.stringify(tagList) !== JSON.stringify(origTags)) patch.tag_list = tagList
    return patch
  }, [voice, voiceName, language, accent, gender, age, description, tagList])

  const isDirty = Object.keys(dirtyPatch).length > 0

  const handleSave = async () => {
    if (!voice?.voice_id) return
    if (!isDirty) {
      // 无改动:直接关闭,不发请求
      onClose?.()
      return
    }
    setSaving(true)
    try {
      const updated = await voicePresets.updateVoice(voice.voice_id, dirtyPatch)
      message.success('已保存')
      onSuccess?.(updated)
      onClose?.()
    } catch (err) {
      message.error(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="编辑音色"
      open={open}
      onCancel={() => { if (!saving) onClose?.() }}
      maskClosable={!saving}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>保存</Button>,
      ]}
      width={520}
      destroyOnClose
    >
      <Form layout="vertical" disabled={saving}>
        <Form.Item label="音色名称" required>
          <Input
            value={voiceName}
            onChange={e => setVoiceName(e.target.value)}
            placeholder="请输入音色名称"
            maxLength={50}
          />
        </Form.Item>

        <Form.Item label="语言">
          <Input
            value={language}
            onChange={e => setLanguage(e.target.value)}
            placeholder="如 中文 / English / 日语"
            allowClear
          />
        </Form.Item>

        <Form.Item label="口音">
          <Input
            value={accent}
            onChange={e => setAccent(e.target.value)}
            placeholder="如 普通话 / 粤语 / 川普"
            allowClear
          />
        </Form.Item>

        <Form.Item label="性别">
          <Select
            value={gender || undefined}
            onChange={v => setGender(v ?? '')}
            options={GENDER_OPTIONS}
            placeholder="请选择"
            allowClear
          />
        </Form.Item>

        <Form.Item label="年龄">
          <Select
            value={age || undefined}
            onChange={v => setAge(v ?? '')}
            options={AGE_OPTIONS}
            placeholder="请选择"
            allowClear
          />
        </Form.Item>

        <Form.Item label="描述">
          <Input.TextArea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="给这个音色写一段描述"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item label="标签">
          <TagChipsEditor value={tagList} onChange={setTagList} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/**
 * 标签 chips 编辑器 — 模式参考 AdvancedSection.jsx 的 PronunciationDictBlock。
 *   - chip + X 删除按钮
 *   - 「+ 添加」按钮 → input → Enter / blur 提交 → 回到「+ 添加」
 *   - 空字符串忽略,重复标签忽略
 */
function TagChipsEditor({ value, onChange }) {
  const list = Array.isArray(value) ? value : []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const update = useCallback((next) => {
    onChange?.(next)
  }, [onChange])

  const commit = useCallback(() => {
    const s = draft.trim()
    if (!s) { setAdding(false); setDraft(''); return }
    if (list.includes(s)) { setAdding(false); setDraft(''); return }
    update([...list, s])
    setDraft('')
    setAdding(false)
  }, [draft, list, update])

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {list.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 12,
            fontSize: 12,
            lineHeight: '18px',
          }}
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => update(list.filter((_, j) => j !== i))}
            aria-label="删除"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'rgba(0,0,0,0.45)',
            }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <Input
          size="small"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onPressEnter={commit}
          onBlur={commit}
          placeholder="标签"
          style={{ width: 120 }}
          maxLength={20}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            border: '1px dashed rgba(0,0,0,0.25)',
            borderRadius: 12,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: '18px',
            color: 'rgba(0,0,0,0.65)',
          }}
        >
          <Plus size={12} /> 添加
        </button>
      )}
    </div>
  )
}
