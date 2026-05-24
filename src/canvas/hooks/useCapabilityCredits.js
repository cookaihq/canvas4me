import { useEffect, useMemo, useState } from 'react'
import { CAPABILITIES } from '../registry/nodeTypes'
import { usePricingFetcher } from '../contexts/PricingFetcherContext'

/**
 * 能力节点积分预估 Hook（通用）。
 *
 * 公式：积分 = (model_price × model_ratio × units) / 1000
 *
 * 调用约定：
 *   - capability 通过 `registerCapability({ pricing: { resolveModelId?, computeUnits? } })` 声明
 *   - 未声明 pricing spec → 返回 { credits: null, ... }，面板不显示积分行
 *   - resolveModelId 缺省：modeId（mode !== 'default'）或 capability id
 *   - computeUnits 缺省：1（适合"按次计费"的简单 capability）
 *   - computeUnits 可返回 Promise<number>；返回 null / 抛错 / billing_mode='estimate' 均隐藏积分
 *
 * @param {string} capability     capability id
 * @param {string} mode           mode id（已 resolved）
 * @param {object} modeParams     当前 mode 的表单参数
 * @param {object} collectedInputs 端口输入（{ [portId]: value | values[] }）
 * @returns {{credits:number|null, pricing:object|null, units:number|null, warning:{message:string}|null, loading:boolean}}
 */
const CREDITS_PER_QUOTA_DIVISOR = 1000

function defaultResolveModelId(capability, mode) {
  if (!capability) return null
  if (mode && mode !== 'default') return mode
  return capability
}

export default function useCapabilityCredits(capability, mode, modeParams, collectedInputs) {
  const capDef = capability ? CAPABILITIES[capability] : null
  const spec = capDef?.pricing || null
  // 装饰层注入实际 fetcher,基础实现不注入(null) → 整个 hook 返回全 null
  const pricingFetcher = usePricingFetcher()

  // ── 解析 modelId（同步，纯函数） ──
  const modelId = useMemo(() => {
    if (!capability) return null
    if (spec?.resolveModelId) {
      try {
        const result = spec.resolveModelId({
          mode,
          modeParams: modeParams || {},
          collectedInputs: collectedInputs || {},
        })
        return typeof result === 'string' && result ? result : null
      } catch (err) {
        console.warn('[useCapabilityCredits] resolveModelId 抛错:', err)
        return null
      }
    }
    return defaultResolveModelId(capability, mode)
  }, [capability, mode, modeParams, collectedInputs, spec])

  // ── 拉 pricing ──
  const [pricing, setPricing] = useState(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  useEffect(() => {
    if (!modelId || !pricingFetcher) {
      // 未注入 fetcher(本地实现) → 永不显示积分
      setPricing(null)
      return undefined
    }
    let cancelled = false
    setPricingLoading(true)
    pricingFetcher(modelId)
      .then((data) => {
        if (cancelled) return
        console.debug('[useCapabilityCredits] pricing 响应:', modelId, data)
        setPricing(data || null)
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[useCapabilityCredits] 获取计费信息失败:', modelId, err?.message || err)
          setPricing(null)
        }
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [modelId, pricingFetcher])

  // ── 算 units（可能是 Promise） ──
  const [units, setUnits] = useState(null)
  const [unitsLoading, setUnitsLoading] = useState(false)

  useEffect(() => {
    if (!spec?.computeUnits) {
      // 缺省：按次计费（1 单位）
      setUnits(1)
      return undefined
    }
    let cancelled = false
    setUnitsLoading(true)
    let result
    try {
      result = spec.computeUnits({
        mode,
        modeParams: modeParams || {},
        collectedInputs: collectedInputs || {},
      })
    } catch (err) {
      console.warn('[useCapabilityCredits] computeUnits 抛错:', err)
      setUnits(null)
      setUnitsLoading(false)
      return undefined
    }
    if (result && typeof result.then === 'function') {
      result
        .then((value) => {
          if (cancelled) return
          console.debug('[useCapabilityCredits] computeUnits (async) =', value, 'mode=', mode)
          setUnits(Number.isFinite(value) && value > 0 ? value : null)
        })
        .catch((err) => {
          if (cancelled) return
          console.warn('[useCapabilityCredits] computeUnits reject:', err?.message || err)
          setUnits(null)
        })
        .finally(() => {
          if (!cancelled) setUnitsLoading(false)
        })
    } else {
      console.debug('[useCapabilityCredits] computeUnits (sync) =', result, 'mode=', mode)
      setUnits(Number.isFinite(result) && result > 0 ? result : null)
      setUnitsLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [spec, mode, modeParams, collectedInputs])

  // ── 合成 credits + perUnitCredits ──
  // perUnitCredits = 每单位积分（units=1 时的 credits），不依赖 units 是否就绪。
  // 当 units 为 null（例如 Auto 时长、文本/音频未提供）但 pricing 已返回时，
  // 由调用方用 perUnitCredits + pricing.unit_label 做"按 X 秒/次 N 积分"的提示。
  const { credits, perUnitCredits } = useMemo(() => {
    if (!pricing) {
      console.debug('[useCapabilityCredits] credits=null 原因: pricing 未返回 (可能 404 / 未注册)')
      return { credits: null, perUnitCredits: null }
    }
    if (pricing.billing_mode === 'estimate') {
      console.debug('[useCapabilityCredits] credits=null 原因: billing_mode=estimate')
      return { credits: null, perUnitCredits: null }
    }
    const modelPrice = Number(pricing.model_price)
    const ratio = Number(pricing.model_ratio) || 1
    if (!Number.isFinite(modelPrice) || modelPrice <= 0) {
      console.debug('[useCapabilityCredits] credits=null 原因: model_price 无效=', pricing.model_price)
      return { credits: null, perUnitCredits: null }
    }
    const perUnit = (modelPrice * ratio) / CREDITS_PER_QUOTA_DIVISOR
    if (units == null) {
      console.debug('[useCapabilityCredits] credits=null 原因: units 未就绪；perUnitCredits=', perUnit)
      return { credits: null, perUnitCredits: perUnit }
    }
    const value = perUnit * units
    console.debug('[useCapabilityCredits] credits=', value, '{ modelPrice, ratio, units }=', { modelPrice, ratio, units })
    return { credits: value, perUnitCredits: perUnit }
  }, [pricing, units])

  // ── 可选：pricing.creditsWarning 给出醒目提醒（如大额消耗确认） ──
  const warning = useMemo(() => {
    if (!spec?.creditsWarning) return null
    if (units == null) return null
    try {
      const result = spec.creditsWarning({
        mode,
        modeParams: modeParams || {},
        units,
        credits,
      })
      if (result && typeof result === 'object' && result.message) return result
      return null
    } catch (err) {
      console.warn('[useCapabilityCredits] creditsWarning 抛错:', err)
      return null
    }
  }, [spec, mode, modeParams, units, credits])

  // ── 可选：pricing.perUnitNote —— units 未就绪时，为"按 X 秒/次 N 积分"行附加说明 ──
  // 例如 seedance-2 在 duration=-1 (Auto) 时返回"实际时长由模型决定"。
  const perUnitNote = useMemo(() => {
    if (!spec?.perUnitNote) return null
    try {
      const result = spec.perUnitNote({
        mode,
        modeParams: modeParams || {},
        collectedInputs: collectedInputs || {},
      })
      return typeof result === 'string' && result ? result : null
    } catch (err) {
      console.warn('[useCapabilityCredits] perUnitNote 抛错:', err)
      return null
    }
  }, [spec, mode, modeParams, collectedInputs])

  return {
    credits,
    perUnitCredits,
    perUnitNote,
    pricing,
    units,
    warning,
    loading: pricingLoading || unitsLoading,
  }
}
