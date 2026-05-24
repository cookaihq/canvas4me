/**
 * useLlmModels —— LLM 子能力 model 清单加载 hook
 *
 * 数据来源:`taskClient.listLlmModels()`(由 platform 注入,各底座实现自带)。
 * 返回扁平表 [{ name, label, badge, description, capabilities }],经 mergeModelLabels 叠加展示元数据。
 * 缓存:模块级变量(进程内)+ sessionStorage(15 分钟 TTL),避免重复调用。
 */
import { useEffect, useState } from 'react'
import { useTaskClient } from '@/platform/provider.jsx'
import { filterModelsByMode, mergeModelLabels, parseModelLabelsEnv } from './llmModelCatalog'

const CACHE_KEY = 'aiCanvas:llmModels'
const CACHE_TTL_MS = 15 * 60 * 1000  // 15 分钟

// 进程内缓存(同一 session 内多个节点共用一次拉取)
let inflight = null
let cached = null

function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeSessionCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // sessionStorage 满 / 隐私模式 — 静默放弃缓存
  }
}

async function loadOnce(taskClient) {
  if (cached) return cached
  if (inflight) return inflight
  const fromSession = readSessionCache()
  if (fromSession) {
    cached = fromSession
    return cached
  }
  inflight = (async () => {
    try {
      const flat = await taskClient.listLlmModels()        // [{ id, capabilities }]
      const overlay = parseModelLabelsEnv(import.meta.env.VITE_LLM_MODEL_LABELS)
      cached = mergeModelLabels(flat, overlay)             // [{ name, label, badge, description, capabilities }]
      writeSessionCache(cached)
      return cached
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * 读取所有 LLM 子能力的 model 清单（扁平表）。
 * 返回 { loading, models, error } —— models 形态:
 *   [{ name, label, badge, description, capabilities }]
 */
export function useLlmModels() {
  const taskClient = useTaskClient()
  const [state, setState] = useState(() => ({
    loading: !cached,
    models: cached || [],
    error: null,
  }))

  useEffect(() => {
    let alive = true
    if (cached) {
      setState({ loading: false, models: cached, error: null })
      return () => { alive = false }
    }
    loadOnce(taskClient)
      .then(data => {
        if (!alive) return
        setState({ loading: false, models: data || [], error: null })
      })
      .catch(err => {
        if (!alive) return
        console.warn('[useLlmModels] 加载失败:', err?.message)
        setState({ loading: false, models: [], error: err })
      })
    return () => { alive = false }
  }, [taskClient])

  return state
}

/**
 * 取某个 mode 的 model 列表：从扁平合并表里按 capability 过滤。
 */
export function getModelsForCapability(models, mode) {
  return filterModelsByMode(models, mode)
}

/**
 * 给一个 model 项,返回稳定的显示文案:label 优先,否则用 name。
 */
export function resolveModelLabel(modelItem) {
  if (!modelItem) return ''
  return modelItem.label || modelItem.name || ''
}
