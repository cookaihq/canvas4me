const RUNTIME_CACHE_PREFIX = 'ai-tools-runtime-'
const PROJECT_CACHE_PREFIX = 'ai-tools-project-'

const buildProjectKey = (appId, projectId) => {
  if (!appId && !projectId) return 'global'
  const safeAppId = appId || 'unknown-app'
  const safeProjectId = projectId || 'unknown-project'
  return `${safeAppId}::${safeProjectId}`
}

const waitForServiceWorkerReady = async () => {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

const sendServiceWorkerMessage = async (payload) => {
  const registration = await waitForServiceWorkerReady()
  const target = navigator.serviceWorker.controller || registration?.active
  if (!target) return false
  target.postMessage(payload)
  return true
}

export const setProjectCacheContext = async ({ appId, projectId }) => (
  sendServiceWorkerMessage({ type: 'SET_PROJECT_CONTEXT', appId, projectId })
)

export const clearProjectCacheContext = async () => (
  sendServiceWorkerMessage({ type: 'CLEAR_PROJECT_CONTEXT' })
)

export const registerProjectResources = async ({ appId, projectId, urls }) => {
  const cleanUrls = (urls || []).filter((item) => typeof item === 'string' && item)
  if (!cleanUrls.length) return false
  return sendServiceWorkerMessage({
    type: 'REGISTER_PROJECT_URLS',
    appId,
    projectId,
    urls: cleanUrls
  })
}

export const getProjectCacheUsage = async () => {
  if (!('caches' in window)) {
    return { groups: [], total: { sizeBytes: 0, unknownCount: 0, itemCount: 0 } }
  }
  const cacheNames = await caches.keys()
  const groups = new Map()

  const parseProjectKey = (cacheName) => {
    if (cacheName.startsWith(PROJECT_CACHE_PREFIX)) {
      const [, projectKey] = cacheName.split('::')
      return projectKey || 'global'
    }
    if (cacheName.startsWith(RUNTIME_CACHE_PREFIX)) {
      return 'global'
    }
    return null
  }

  const parseProjectInfo = (projectKey) => {
    if (!projectKey || projectKey === 'global') {
      return { appId: null, projectId: null }
    }
    const [appId, projectId] = projectKey.split('::')
    return { appId: appId || null, projectId: projectId || null }
  }

  for (const cacheName of cacheNames) {
    if (!cacheName.startsWith(RUNTIME_CACHE_PREFIX) && !cacheName.startsWith(PROJECT_CACHE_PREFIX)) {
      continue
    }
    const projectKey = parseProjectKey(cacheName) || 'global'
    const { appId, projectId } = parseProjectInfo(projectKey)
    const cache = await caches.open(cacheName)
    const items = await cache.keys()
    const group = groups.get(projectKey) || {
      projectKey,
      appId,
      projectId,
      cacheName,
      sizeBytes: 0,
      unknownCount: 0,
      itemCount: 0
    }
    group.itemCount += items.length
    group.unknownCount += items.length
    groups.set(projectKey, group)
  }

  const result = Array.from(groups.values())
  const total = result.reduce((acc, item) => {
    acc.sizeBytes += item.sizeBytes
    acc.unknownCount += item.unknownCount
    acc.itemCount += item.itemCount
    return acc
  }, { sizeBytes: 0, unknownCount: 0, itemCount: 0 })

  return { groups: result, total }
}

export const clearProjectCache = async ({ appId, projectId, projectKey }) => {
  if (!('caches' in window)) return
  const key = projectKey || buildProjectKey(appId, projectId)
  const cacheNames = await caches.keys()
  const targets = key === 'global'
    ? cacheNames.filter((name) => name.startsWith('ai-tools-runtime-'))
    : cacheNames.filter((name) => (
      name.startsWith('ai-tools-project-') && name.includes(`::${key}`)
    ))
  await Promise.all(targets.map((name) => caches.delete(name)))
}

export const clearAllResourceCaches = async () => {
  if (!('caches' in window)) return
  const cacheNames = await caches.keys()
  const targets = cacheNames.filter((name) => (
    name.startsWith('ai-tools-runtime-') || name.startsWith('ai-tools-project-')
  ))
  await Promise.all(targets.map((name) => caches.delete(name)))
}

export const formatBytes = (value) => {
  if (!Number.isFinite(value)) return 'Unknown'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}
