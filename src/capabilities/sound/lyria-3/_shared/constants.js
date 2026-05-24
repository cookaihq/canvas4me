/**
 * Lyria 3 常量 —— 两个 model（clip / pro）共享 schema，仅时长与计费不同。
 */
export const DEFAULT_MODEL = 'lyria-3'
export const MAX_MOODBOARD_IMAGES = 10

// 底栏「模型」chip 的选项 —— 形状对齐 ModelParamSelector（value/label/badge/description）。
// badge 映射图标见 ModelParamSelector.BADGE_ICON（pro→Brain, preview→Eye）。
export const LYRIA_MODELS = [
  { value: 'lyria-3',     label: 'Lyria 3 Clip', badge: 'preview', description: '30 秒稳定片段' },
  { value: 'lyria-3-pro', label: 'Lyria 3 Pro',  badge: 'pro',     description: '最长 3 分钟完整曲目' },
]

// 结构 / 时间戳标签快捷插入，点击插入到光标处。
// 段落标签取自上游文档（foxapi lyria + Google Lyria 提示词指南）：
// Intro / Verse / Pre-Chorus / Chorus / Bridge / Outro，按歌曲结构排序；末尾为时间戳模板。
// 注：Pro 模型下段落标签建议 ≤3 个，过多易触发生成失败（上游文档提示）。
export const STRUCTURE_TAGS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]', '[0:00-0:00]']

export function modelShortLabel(model) {
  return String(model || '').includes('pro') ? 'Pro' : 'Clip'
}

export function formatDuration(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
