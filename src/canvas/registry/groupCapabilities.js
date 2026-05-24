/**
 * 把某 nodeType 下的 capability 平铺数组按 category 分组,供选择器排版。
 *
 * 渲染契约(§4.5):
 *   - 只有默认桶(无任何命名分类)→ 返回单组,label=null → 调用方不渲染标题(视觉=平铺)
 *   - 有命名分类 → 按 order 各成一组(带 label/icon);若同时有未分类能力,默认桶以 label='其它' 垫底
 *
 * getCapabilitiesByNodeType 保持返回平铺数组不动(其它调用方不受影响)。
 */
import { CATEGORIES } from './categories'
import { getCapabilitiesByNodeType } from './nodeTypes'

const UNCATEGORIZED = Symbol('uncategorized')

/** 纯函数核心(可单测,不依赖 registry/图标) */
export function groupByCategory(capabilities, categories) {
  const buckets = new Map()
  for (const cap of capabilities) {
    const key = cap.category && categories[cap.category] ? cap.category : UNCATEGORIZED
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(cap)
  }

  const named = [...buckets.keys()]
    .filter(k => k !== UNCATEGORIZED)
    .sort((a, b) => (categories[a].order ?? 0) - (categories[b].order ?? 0))
    .map(id => ({
      categoryId: id,
      label: categories[id].label,
      icon: categories[id].icon,
      capabilities: buckets.get(id),
    }))

  const uncategorized = buckets.has(UNCATEGORIZED)
    ? [{
        categoryId: null,
        label: named.length > 0 ? '其它' : null, // 只有默认桶 → null → 不渲染标题
        icon: null,
        capabilities: buckets.get(UNCATEGORIZED),
      }]
    : []
  return [...named, ...uncategorized]
}

/** registry 版:取某 nodeType 的可见 capability 后分组 */
export function groupCapabilitiesByCategory(nodeType) {
  return groupByCategory(getCapabilitiesByNodeType(nodeType), CATEGORIES)
}
