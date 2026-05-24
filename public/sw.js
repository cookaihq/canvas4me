const CACHE_VERSION = 'v1'
const RUNTIME_CACHE = `ai-tools-runtime-${CACHE_VERSION}`
const PROJECT_CACHE_PREFIX = `ai-tools-project-${CACHE_VERSION}::`
const VIDEO_COVER_PATH_PREFIX = '/__video_covers/'

const clientContexts = new Map()
const urlMappings = new Map()

const buildProjectKey = (appId, projectId) => {
  if (!appId && !projectId) return 'global'
  const safeAppId = appId || 'unknown-app'
  const safeProjectId = projectId || 'unknown-project'
  return `${safeAppId}::${safeProjectId}`
}

const getCacheName = (projectKey) => {
  if (!projectKey || projectKey === 'global') return RUNTIME_CACHE
  return `${PROJECT_CACHE_PREFIX}${projectKey}`
}

const shouldHandleRequest = (request) => {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (!['http:', 'https:'].includes(url.protocol)) return false

  const destination = request.destination
  if (['image', 'font', 'audio', 'video'].includes(destination)) return true

  const accept = request.headers.get('accept') || ''
  return accept.includes('image/') || accept.includes('font/') || accept.includes('audio/') || accept.includes('video/')
}

const getHeaderProjectInfo = (request) => {
  const appId = request.headers.get('x-ai-app-id') || request.headers.get('x-project-app-id')
  const projectId = request.headers.get('x-ai-project-id') || request.headers.get('x-project-id')
  if (!appId && !projectId) return null
  return { appId, projectId }
}

const getContextProjectInfo = (clientId) => {
  if (!clientId) return null
  return clientContexts.get(clientId) || null
}

const getMappedProjectInfo = (url) => urlMappings.get(url) || null

const resolveProjectInfo = (event) => {
  const headerInfo = getHeaderProjectInfo(event.request)
  if (headerInfo) return headerInfo

  const contextInfo = getContextProjectInfo(event.clientId)
  if (contextInfo) return contextInfo

  return getMappedProjectInfo(event.request.url)
}

const fetchAndCache = async (cache, request) => {
  const response = await fetch(request)
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone())
  }
  return response
}

const isVideoCoverRequest = (request) => {
  try {
    const url = new URL(request.url)
    return url.origin === self.location.origin && url.pathname.startsWith(VIDEO_COVER_PATH_PREFIX)
  } catch {
    return false
  }
}

const handleVideoCoverFetch = async (event) => {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(event.request, { ignoreSearch: true })
  if (cached) return cached
  return new Response('Not Found', { status: 404 })
}

const cleanupOldCaches = async () => {
  const keys = await caches.keys()
  const toDelete = keys.filter((key) => (
    (key.startsWith('ai-tools-runtime-') && key !== RUNTIME_CACHE) ||
    (key.startsWith('ai-tools-project-') && !key.startsWith(`ai-tools-project-${CACHE_VERSION}::`))
  ))
  if (!toDelete.length) return
  await Promise.all(toDelete.map((name) => caches.delete(name)))
}

const shouldInterceptRequest = (request) => (
  isVideoCoverRequest(request) || shouldHandleRequest(request)
)

const handleFetch = async (event) => {
  const { request } = event
  if (isVideoCoverRequest(request)) {
    return handleVideoCoverFetch(event)
  }

  const projectInfo = resolveProjectInfo(event)
  const projectKey = buildProjectKey(projectInfo?.appId, projectInfo?.projectId)
  const cacheName = getCacheName(projectKey)
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  if (cached) {
    event.waitUntil(fetchAndCache(cache, request).catch(() => null))
    return cached
  }

  try {
    return await fetchAndCache(cache, request)
  } catch (error) {
    return cached || Response.error()
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCaches().then(() => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SET_PROJECT_CONTEXT' && event.source?.id) {
    clientContexts.set(event.source.id, {
      appId: data.appId || null,
      projectId: data.projectId || null
    })
    return
  }
  if (data.type === 'CLEAR_PROJECT_CONTEXT' && event.source?.id) {
    clientContexts.delete(event.source.id)
    return
  }
  if (data.type === 'REGISTER_PROJECT_URLS') {
    const projectKey = buildProjectKey(data.appId, data.projectId)
    const cleanUrls = (data.urls || []).filter((item) => typeof item === 'string' && item)
    cleanUrls.forEach((url) => {
      urlMappings.set(url, {
        appId: data.appId || null,
        projectId: data.projectId || null,
        projectKey
      })
    })
  }
})

self.addEventListener('fetch', (event) => {
  if (!shouldInterceptRequest(event.request)) {
    return
  }

  event.respondWith(handleFetch(event))
})
