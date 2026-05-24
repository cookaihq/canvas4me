// 媒体输入卡形态决策：默认按容量阈值，能力可覆盖。
// form: 'card' | 'thumb' | undefined(自动)
export function resolveMediaForm({ maxCount = 1, form } = {}) {
  if (form === 'card' || form === 'thumb') return form
  return maxCount > 2 ? 'thumb' : 'card'
}
