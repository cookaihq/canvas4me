import { getProxyUrl } from './proxyUrl'

const INSTALL_FLAG = '__aiToolsFetchLoggerInstalled__'

export function initFetchLogger() {
  if (typeof window === 'undefined' || !window.fetch) {
    return
  }

  if (window[INSTALL_FLAG]) {
    return
  }

  window[INSTALL_FLAG] = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const skipLog = Boolean(init && init.__skipApiLog)
    const requestInfo = skipLog ? null : buildRequestInfo(input, init)
    if (!skipLog) {
      logRequestInfo(requestInfo)
    }

    const nextInit = sanitizeInit(init)
    const proxiedInput = rewriteProxyUrl(input)
    const response = await originalFetch(proxiedInput, nextInit)

    if (!skipLog) {
      logResponseInfo(response, requestInfo)
    }

    return response
  }
}

function buildRequestInfo(input, init) {
  const url = resolveUrl(input)
  const method = resolveMethod(input, init)
  const queryParams = extractQueryParams(url)
  const body = extractBody(init)

  return { url, method, queryParams, body }
}

function resolveUrl(input) {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

function resolveMethod(input, init) {
  if (init && init.method) return String(init.method).toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request && input.method) {
    return String(input.method).toUpperCase()
  }
  return 'GET'
}

function extractQueryParams(rawUrl) {
  if (!rawUrl) return null

  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost'
    const url = new URL(rawUrl, baseUrl)
    if (!url.searchParams || Array.from(url.searchParams.keys()).length === 0) {
      return null
    }

    const params = {}
    for (const [key, value] of url.searchParams.entries()) {
      if (params[key] === undefined) {
        params[key] = value
      } else if (Array.isArray(params[key])) {
        params[key].push(value)
      } else {
        params[key] = [params[key], value]
      }
    }
    return params
  } catch (error) {
    return null
  }
}

function extractBody(init) {
  if (!init || !('body' in init)) return undefined
  return formatBody(init.body)
}

function formatBody(body) {
  if (body === null || body === undefined) return body

  if (typeof body === 'string') {
    return tryParseJson(body)
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries())
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return formatFormData(body)
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { type: 'Blob', mime: body.type, size: body.size }
  }

  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: body.byteLength }
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return '[ReadableStream]'
  }

  if (typeof URL !== 'undefined' && body instanceof URL) {
    return body.toString()
  }

  if (typeof body === 'object') return body

  return body
}

function formatFormData(formData) {
  const entries = {}

  const addEntry = (key, value) => {
    if (entries[key] === undefined) {
      entries[key] = value
    } else if (Array.isArray(entries[key])) {
      entries[key].push(value)
    } else {
      entries[key] = [entries[key], value]
    }
  }

  for (const [key, value] of formData.entries()) {
    if (typeof File !== 'undefined' && value instanceof File) {
      addEntry(key, {
        type: 'File',
        name: value.name,
        size: value.size,
        mime: value.type,
      })
      continue
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      addEntry(key, {
        type: 'Blob',
        size: value.size,
        mime: value.type,
      })
      continue
    }

    addEntry(key, value)
  }

  return { type: 'FormData', entries }
}

function tryParseJson(text) {
  const trimmed = text.trim()
  if (!trimmed) return text

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed)
    } catch (error) {
      return text
    }
  }

  return text
}

function logRequestInfo({ url, method, queryParams, body }) {
  console.groupCollapsed(`🚀 [Fetch] ${method} ${url}`)
  console.log('URL:', url)
  if (queryParams) {
    console.log('Query:', queryParams)
  }
  if (body !== undefined) {
    console.log('Params:', body)
  }
  console.groupEnd()
}

async function logResponseInfo(response, requestInfo) {
  if (!response) return

  const contentType = response.headers?.get('content-type') || ''
  const contentLength = response.headers?.get('content-length')
  const status = response.status
  const statusText = response.statusText
  const label = requestInfo ? `${requestInfo.method} ${requestInfo.url}` : response.url

  console.groupCollapsed(`✅ [Fetch] Response ${status} ${label}`)
  console.log('Status:', status, statusText)
  if (contentType) {
    console.log('Content-Type:', contentType)
  }
  if (contentLength) {
    console.log('Content-Length:', contentLength)
  }

  try {
    const bodyPreview = await getResponsePreview(response, contentType, contentLength)
    if (bodyPreview !== undefined) {
      console.log('Body:', bodyPreview)
    }
  } catch (error) {
    console.warn('Response preview failed:', error?.message || error)
  }

  console.groupEnd()
}

async function getResponsePreview(response, contentType, contentLength) {
  if (!response || !response.clone) return undefined

  const lowerType = (contentType || '').toLowerCase()
  const lengthValue = contentLength ? Number(contentLength) : NaN

  if (isStreamContentType(lowerType)) {
    return { type: 'stream', contentType: lowerType || 'unknown' }
  }

  if (isBinaryContentType(lowerType)) {
    return {
      type: 'binary',
      contentType: lowerType || 'unknown',
      size: Number.isFinite(lengthValue) ? lengthValue : undefined,
    }
  }

  if (Number.isFinite(lengthValue) && lengthValue > 200000) {
    return { type: 'text', size: lengthValue, truncated: true }
  }

  const clone = response.clone()

  if (lowerType.includes('application/json')) {
    const text = await clone.text()
    return tryParseJsonWithLimit(text)
  }

  if (lowerType.startsWith('text/')) {
    const text = await clone.text()
    return limitText(text)
  }

  return undefined
}

function isStreamContentType(contentType) {
  return contentType.includes('text/event-stream')
}

function isBinaryContentType(contentType) {
  if (!contentType) return false
  return contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream')
}

function tryParseJsonWithLimit(text) {
  const parsed = tryParseJson(text)
  if (typeof parsed === 'string') {
    return limitText(parsed)
  }
  return parsed
}

function limitText(text, maxLength = 2000) {
  if (typeof text !== 'string') return text
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`
}

function rewriteProxyUrl(input) {
  if (import.meta.env.PROD) return input

  if (typeof input === 'string') {
    return getProxyUrl(input)
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const proxied = getProxyUrl(input.url)
    if (proxied !== input.url) {
      return new Request(proxied, input)
    }
  }
  return input
}

function sanitizeInit(init) {
  if (!init || typeof init !== 'object') return init
  if (!('__skipApiLog' in init)) return init

  const nextInit = { ...init }
  delete nextInit.__skipApiLog
  return nextInit
}
