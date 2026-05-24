/**
 * 根据当前 mode 的可选 model 清单 + 当前 params.model 决定:
 *   - 显示用值(value):若 params.model 在列表里则用之,否则用列表第 1 项
 *   - 应自动重置(needsReset): 列表已加载 + params.model 不在列表里
 *   - reasoning 默认值: 当前选中 model 的 badge==='thinking' → true,否则 false
 *
 * 使用方在 useEffect 里看 needsReset/recommendedModel,如不一致则 onParamsChange 重置。
 */
import { useEffect, useMemo } from 'react'

export default function useModelForMode({
  mode,
  models,
  loading,
  params,
  onParamsChange,
}) {
  const list = Array.isArray(models) ? models : []
  const firstModel = list[0] || null

  const currentItem = useMemo(() => {
    if (!params?.model) return null
    return list.find(m => m.name === params.model) || null
  }, [list, params?.model])

  const effectiveModel = currentItem || firstModel || null
  const effectiveValue = effectiveModel?.name || null
  const thinkingDefault = effectiveModel?.badge === 'thinking'

  // 列表加载完成 + params.model 缺失或不在列表 → 自动写入第 1 项
  useEffect(() => {
    if (loading) return
    if (!firstModel) return  // 清单为空(理论上启动校验已挡掉,这里只是防御) — 不动 params
    if (params?.model && list.some(m => m.name === params.model)) return
    onParamsChange({ model: firstModel.name })
  }, [loading, firstModel, list, params?.model, onParamsChange])

  // 仅在首次没设过 reasoning 时,按 model.badge 推默认值。用户一旦改过就持久化,
  // 之后即使切到非 thinking 模型也保留用户值(避免强制覆盖)。
  useEffect(() => {
    if (!effectiveValue) return
    if (params?.reasoning != null) return
    if (thinkingDefault) onParamsChange({ reasoning: true })
  }, [effectiveValue, thinkingDefault, params?.reasoning, onParamsChange])

  return { effectiveValue, effectiveModel, list }
}
