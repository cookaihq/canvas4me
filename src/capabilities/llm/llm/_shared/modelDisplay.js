/**
 * 模型显示表：label / badge / description。键 = 精确 id 或 通配符（单 *）。
 * label 含 * → 捕获回填；badge / description 静态（通配符也生效）。
 * badge 取值须在 ModelParamSelector 的 BADGE_ICON 集合内（thinking/pro/fast/preview/vision），否则回退默认图标。
 */
import { matchBestKey, applyLabelTemplate } from './modelConfigMatch.js'

export const MODEL_DISPLAY = {
  'gpt-*': { label: 'GPT *' },
  'claude-*': { label: 'Claude *' },
  'gemini-*': { label: 'Gemini *' },
}

export function resolveModelDisplay(id) {
  const m = matchBestKey(MODEL_DISPLAY, id)
  if (!m) return { label: id, badge: '', description: '' }
  const v = m.value || {}
  return {
    label: v.label ? applyLabelTemplate(m.key, v.label, id) : id,
    badge: v.badge || '',
    description: v.description || '',
  }
}
