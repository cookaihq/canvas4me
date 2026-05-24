/**
 * 底层 HTTP 请求工具
 *
 * ⚠️ 选择指南：
 * - 调用自家后端 API（/api/...）→ 请使用 src/api/client.js（apiClient）
 *   apiClient 会自动拼接 VITE_API_BASE_URL 域名、注入 Token 和 X-Team-ID、处理 Token 刷新
 * - 调用第三方外部 API（Cloudflare Worker、外部 Prompt API 等）→ 使用本文件的 request/get/post
 *   这些场景不需要拼接 VITE_API_BASE_URL，也不需要注入 Team ID
 *
 * 本文件是底层工具，apiClient 内部也依赖它。应用代码不应直接使用本文件调用自家后端。
 */

import { tokenManager } from './tokenManager'

const DEBUG_STREAMING_OUTPUT = (() => {
  const normalized = String(import.meta.env.VITE_DEBUG_STREAMING_OUTPUT || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
})()

/**
 * 统一的 HTTP 请求函数
 *
 * url 支持两种形式：
 * 1) 相对路径：如 /api/v1/...（推荐用于同源/网关）
 * 2) 完整 URL：如 https://example.com/api/...（直连目标域名，需目标端允许 CORS）
 *
 * @param {string} url - 请求 URL（相对路径或完整 URL）
 * @param {Object} options - 请求选项
 * @param {string} options.method - 请求方法，默认 'GET'
 * @param {Object|FormData} options.body - 请求体
 * @param {Object} options.headers - 额外的请求头
 * @param {boolean} options.useFormData - 使用 FormData，默认 false（自动检测）
 * @param {boolean} options.skipLog - 跳过日志输出，默认 false
 * @param {boolean} options.expectApiResponse - 按 code/message/data 解析并返回 data，默认 false
 * @param {function} options.onResponse - 响应回调 (response: Response) => void
 * @returns {Promise<any>} 响应数据
 *
 * @example
 * // ✅ 相对路径
 * await request('/api/v1/user/profile/get', { method: 'GET' })
 *
 * @example
 * // ✅ 完整 URL
 * await request('https://example.com/v1/chat/completions', { method: 'POST', body: data })
 */
export async function request(url, options = {}) {
  const context = await buildRequestContext(url, options)
  const { method, requestUrl, requestHeaders, requestBody, isFormData, skipLog } = context
  const { expectApiResponse = false } = options

  // 5. 打印请求日志
  if (!skipLog) {
    console.group(`🌐 HTTP 请求: ${method} ${url}`)
    console.log('🔗 原始 URL:', url)
    console.log('🔗 实际请求 URL:', requestUrl)
    console.log('📋 请求方法:', method)
    if (requestHeaders?.Authorization) {
      console.log('🔑 认证信息:', `${requestHeaders.Authorization.substring(0, 16)}...`)
    }
    console.log('📦 请求头:', requestHeaders)
    if (requestBody) {
      if (isFormData) {
        console.log('📦 请求体: [FormData]')
        // 打印 FormData 的详细内容
        console.group('📋 FormData 详细内容:')
        for (const [key, value] of options.body.entries()) {
          if (value instanceof File || value instanceof Blob) {
            console.log(`  ${key}:`, `[${value instanceof File ? 'File' : 'Blob'}] name=${value.name || 'N/A'}, type=${value.type}, size=${value.size} bytes`)
          } else {
            console.log(`  ${key}:`, value)
          }
        }
        console.groupEnd()
      } else {
        try {
          console.log('📦 请求体:', JSON.parse(requestBody))
        } catch {
          console.log('📦 请求体:', requestBody)
        }
      }
    }
    console.log('⏰ 请求时间:', new Date().toLocaleString())
    console.groupEnd()
  }

  try {
    const response = await fetchWithStatus(url, options, context)

    // 8. 解析成功响应
    const contentType = response.headers.get('content-type')
    let data

    if (contentType && contentType.includes('application/json')) {
      const responseClone = response.clone()
      try {
        data = await response.json()
      } catch (parseError) {
        let rawText = ''
        try {
          rawText = await responseClone.text()
        } catch {}

        const maxLogLength = 2000
        const displayText = rawText && rawText.length > maxLogLength
          ? `${rawText.slice(0, maxLogLength)}... [truncated ${rawText.length - maxLogLength} chars]`
          : rawText

        const error = new Error('响应解析失败：返回的 JSON 格式不正确')
        error.name = 'InvalidJsonError'
        error.cause = parseError
        error.status = response.status
        error.statusText = response.statusText
        error.url = requestUrl
        error.method = method
        error.rawText = rawText
        error.__skipLog = true

        if (!skipLog) {
          console.group(`❌ HTTP 响应解析失败: ${method} ${url}`)
          console.log('📊 状态码:', response.status, response.statusText)
          console.log('🏷️ Content-Type:', contentType || '(none)')
          console.log('📄 原始响应文本:', displayText || '[empty]')
          console.log('⏰ 响应时间:', new Date().toLocaleString())
          console.groupEnd()
        }

        throw error
      }

      if (expectApiResponse) {
        data = normalizeApiResponse(data, { url, method, requestUrl })
      }
    } else if (contentType && contentType.startsWith('text/')) {
      data = await response.text()
    } else {
      data = await response.blob()
    }

    // 9. 打印响应日志
    if (!skipLog) {
      console.group(`✅ HTTP 响应: ${method} ${url}`)
      console.log('📊 状态码:', response.status, response.statusText)
      console.log('🏷️ Content-Type:', contentType || '(none)')
      console.log('📄 响应数据:', data)
      console.log('⏰ 响应时间:', new Date().toLocaleString())
      console.groupEnd()
    }

    return data
  } catch (error) {
    // 10. 错误处理
    if (!skipLog && !error.message.startsWith('请求失败') && !error.__skipLog) {
      console.group(`❌ HTTP 异常: ${method} ${url}`)
      console.error('错误详情:', error)
      console.groupEnd()
    }
    throw error
  }
}

export async function requestRaw(url, options = {}) {
  const context = await buildRequestContext(url, options)
  const { method, requestUrl, requestHeaders, requestBody, isFormData, skipLog } = context

  if (!skipLog) {
    console.group(`🌐 HTTP 原始请求: ${method} ${url}`)
    console.log('🔗 原始 URL:', url)
    console.log('🔗 实际请求 URL:', requestUrl)
    console.log('📋 请求方法:', method)
    if (requestHeaders?.Authorization) {
      console.log('🔑 认证信息:', `${requestHeaders.Authorization.substring(0, 16)}...`)
    }
    console.log('📦 请求头:', requestHeaders)
    if (requestBody) {
      if (isFormData) {
        console.log('📦 请求体: [FormData]')
      } else {
        try {
          console.log('📦 请求体:', JSON.parse(requestBody))
        } catch {
          console.log('📦 请求体:', requestBody)
        }
      }
    }
    console.log('⏰ 请求时间:', new Date().toLocaleString())
    console.groupEnd()
  }

  try {
    const response = await fetchWithStatus(url, options, context)

    if (!skipLog) {
      console.group(`✅ HTTP 原始响应: ${method} ${url}`)
      console.log('📊 状态码:', response.status, response.statusText)
      console.log('🏷️ Content-Type:', response.headers.get('content-type') || '(none)')
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        console.log('📏 Content-Length:', contentLength)
      }
      console.log('⏰ 响应时间:', new Date().toLocaleString())
      console.groupEnd()
    }

    return response
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message : ''
    if (!skipLog && !message.startsWith('请求失败') && !error.__skipLog) {
      console.group(`❌ HTTP 原始异常: ${method} ${url}`)
      console.error('错误详情:', error)
      console.groupEnd()
    }
    throw error
  }
}

async function buildRequestContext(url, options = {}) {
  const requestUrl = url

  const {
    method = 'GET',
    body = null,
    headers = {},
    useFormData = false,
    skipLog = false,
  } = options

  // 1. 构建请求头（保持调用方自定义 Authorization）
  const requestHeaders = {
    ...headers,
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  const isRelativeUrl = !/^https?:\/\//i.test(requestUrl)
  const isApiBase = apiBaseUrl ? requestUrl.startsWith(apiBaseUrl) : false
  const accessToken = tokenManager.getAccessToken()
  // 内部 API 默认附带登录 Token
  if (!requestHeaders.Authorization && accessToken && (isRelativeUrl || isApiBase)) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  // 如果不是 FormData，设置 Content-Type
  const isFormData = body instanceof FormData || useFormData
  if (!isFormData && body && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  // 4. 构建请求体
  let requestBody = body
  if (body && !isFormData && typeof body === 'object') {
    requestBody = JSON.stringify(body)
  }

  return {
    method,
    requestUrl,
    requestHeaders,
    requestBody,
    isFormData,
    skipLog,
  }
}

async function fetchWithStatus(url, options = {}, presetContext = null) {
  const context = presetContext || await buildRequestContext(url, options)
  const { method, requestUrl, requestHeaders, requestBody } = context
  const { expectedStatus = 200, allowStatuses = [] } = options

  // 6. 发送请求
  // 提取 fetch 支持的选项（signal, credentials, mode, cache, redirect 等）
  const fetchOptions = {
    method,
    headers: requestHeaders,
    body: requestBody,
    __skipApiLog: true,
  }

  // 传递其他 fetch 选项（如 signal 用于取消请求）
  if (options.signal) fetchOptions.signal = options.signal
  if (options.credentials) fetchOptions.credentials = options.credentials
  if (options.mode) fetchOptions.mode = options.mode
  if (options.cache) fetchOptions.cache = options.cache
  if (options.redirect) fetchOptions.redirect = options.redirect

  const response = await fetch(requestUrl, fetchOptions)

  if (typeof options.onResponse === 'function') {
    try {
      options.onResponse(response)
    } catch {}
  }

  // 检查是否是超时错误（504 Gateway Time-out）
  if (response.status === 504) {
    console.error('⏰ [API 网关超时] 服务器返回 504 Gateway Timeout，可能原因：')
    console.error('   ├─ 上游服务器（AI 模型服务）处理时间过长')
    console.error('   ├─ Nginx/网关超时配置（通常 60-120 秒）')
    console.error('   └─ 建议：联系管理员检查服务器配置或稍后重试')
    const apiTimeoutError = new Error('API 网关超时 (504)：服务器处理时间过长，请稍后重试')
    apiTimeoutError.isApiTimeout = true  // 标记为 API 超时
    apiTimeoutError.statusCode = 504
    throw apiTimeoutError
  }

  const acceptableStatuses = new Set([expectedStatus, ...allowStatuses])
  if (!acceptableStatuses.has(response.status)) {
    let errorData
    try {
      const textContent = await response.text()
      try {
        errorData = JSON.parse(textContent)
      } catch {
        errorData = { message: textContent || `HTTP ${response.status} 错误` }
      }
    } catch {
      errorData = { message: `HTTP ${response.status} 错误` }
    }

    if (!options.skipLog) {
      console.group(`❌ HTTP 错误: ${method} ${url}`)
      console.log('📊 状态码:', response.status, response.statusText)
      console.log('🏷️ Content-Type:', response.headers.get('content-type') || '(none)')
      console.log('📄 错误响应:', errorData)
      console.groupEnd()
    }

    const errorMessage = errorData.error?.message || errorData.message || JSON.stringify(errorData)
    const error = new Error(`请求失败 (${response.status}): ${errorMessage}`)
    if (errorData && errorData.code !== undefined) {
      error.code = errorData.code
    }
    error.status = response.status
    error.statusText = response.statusText
    error.data = errorData
    error.url = requestUrl
    error.method = method
    throw error
  }

  return response
}

function normalizeApiResponse(payload, context = {}) {
  const { url, method, requestUrl } = context
  if (!payload || typeof payload !== 'object') {
    const error = new Error('响应格式异常：缺少 code/message/data')
    error.code = 'INVALID_RESPONSE'
    error.status = 200
    error.data = payload
    error.url = requestUrl || url
    error.method = method
    throw error
  }

  if (!('code' in payload) || !('message' in payload)) {
    const error = new Error('响应格式异常：缺少 code/message/data')
    error.code = 'INVALID_RESPONSE'
    error.status = 200
    error.data = payload
    error.url = requestUrl || url
    error.method = method
    throw error
  }

  if (payload.code !== 0) {
    const error = new Error(payload.message || '请求失败')
    error.code = payload.code
    error.status = 200
    error.data = payload.data
    error.url = requestUrl || url
    error.method = method
    throw error
  }

  return payload.data
}

/**
 * GET 请求快捷方法
 */
export async function get(url, options = {}) {
  return request(url, { ...options, method: 'GET' })
}

/**
 * POST 请求快捷方法（JSON）
 */
export async function post(url, data, options = {}) {
  return request(url, { ...options, method: 'POST', body: data })
}

/**
 * POST 请求快捷方法（FormData）
 */
export async function postFormData(url, formData, options = {}) {
  return request(url, {
    ...options,
    method: 'POST',
    body: formData,
    useFormData: true
  })
}

/**
 * PUT 请求快捷方法
 */
export async function put(url, data, options = {}) {
  return request(url, { ...options, method: 'PUT', body: data })
}

/**
 * DELETE 请求快捷方法
 */
export async function del(url, options = {}) {
  return request(url, { ...options, method: 'DELETE' })
}

/**
 * 流式 POST 请求（支持 SSE）
 *
 * 用于需要流式输出的场景，如 LLM 对话。
 * 内部自动处理 SSE 格式解析，通过 onChunk 回调返回增量内容。
 *
 * @param {string} url - 完整的请求 URL
 * @param {Object|null} data - 请求体数据（默认会自动添加 stream: true）
 * @param {Object} options - 请求选项
 * @param {Function} options.onChunk - 接收流式数据的回调 (chunk: string) => void
 * @param {AbortSignal} options.signal - AbortController 的 signal，用于中断请求
 * @param {Object} options.headers - 额外的请求头
 * @param {boolean} options.skipLog - 跳过日志输出，默认 false
 * @param {string} options.method - 请求方法，默认 'POST'
 * @param {boolean} options.injectStream - 是否自动注入 stream: true，默认 true
 * @returns {Promise<{content: string, usage: Object|null}>} - 完整的响应内容和 usage 信息
 *
 * @example
 * const { content, usage } = await streamPost(
 *   'https://example.com/v1/chat/completions',
 *   { model: 'gpt-4', messages: [...] },
 *   {
 *     onChunk: (chunk) => console.log('收到:', chunk),
 *     signal: abortController.signal
 *   }
 * )
 */
export async function streamPost(url, data, options = {}) {
  const {
    onChunk,
    signal,
    headers = {},
    skipLog = false,
    method = 'POST',
    injectStream = true,
  } = options
  const requestMethod = method.toUpperCase()
  const shouldSendBody = requestMethod !== 'GET' && requestMethod !== 'HEAD'

  const requestUrl = url

  // 2. 构建请求体（默认自动添加 stream: true）
  let requestBody = null
  if (shouldSendBody) {
    if (injectStream) {
      const baseData = data && typeof data === 'object' ? data : {}
      requestBody = { ...baseData, stream: true }
    } else {
      requestBody = data
    }
  }

  // 3. 构建请求头
  const requestHeaders = {
    ...(shouldSendBody ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  }
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  const isRelativeUrl = !/^https?:\/\//i.test(requestUrl)
  const isApiBase = apiBaseUrl ? requestUrl.startsWith(apiBaseUrl) : false
  const accessToken = tokenManager.getAccessToken()
  // 内部 API 默认附带登录 Token
  if (!requestHeaders.Authorization && accessToken && (isRelativeUrl || isApiBase)) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  // 4. 打印请求日志
  if (!skipLog) {
    console.group(`🌊 HTTP 流式请求: ${requestMethod} ${url}`)
    console.log('🔗 原始 URL:', url)
    console.log('🔗 实际请求 URL:', requestUrl)
    console.log('📋 请求方法:', requestMethod)
    if (requestHeaders?.Authorization) {
      console.log('🔑 认证信息:', `${requestHeaders.Authorization.substring(0, 16)}...`)
    }
    console.log('📦 请求头:', requestHeaders)
    if (shouldSendBody && requestBody) {
      console.log('📦 请求体:', requestBody)
    }
    console.log('⏰ 请求时间:', new Date().toLocaleString())
    console.groupEnd()
  }

  try {
    // 6. 发送请求
    const response = await fetchWithStatus(url, {
      method: requestMethod,
      headers: requestHeaders,
      body: requestBody,
      signal,
      skipLog,
    }, {
      method: requestMethod,
      requestUrl,
      requestHeaders,
      requestBody: shouldSendBody && requestBody && typeof requestBody === 'object'
        ? JSON.stringify(requestBody)
        : requestBody,
    })

    // 7. 检查响应状态
    // 8. 读取流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let usage = null
    let currentEvent = null
    let pendingDataLines = []

    const flushSseEvent = async () => {
      if (pendingDataLines.length === 0) {
        currentEvent = null
        return false
      }

      const dataStr = pendingDataLines.join('\n')
      pendingDataLines = []

      if (dataStr === '[DONE]') {
        if (!skipLog) {
          console.log('✅ [流式响应] 完成')
        }
        await reader.cancel()
        return true
      }

      if (/^id:\s*\S+$/i.test(dataStr)) {
        currentEvent = null
        return false
      }

      let parsed = null
      let parsedOk = false
      if (dataStr) {
        try {
          parsed = JSON.parse(dataStr)
          parsedOk = true
        } catch (e) {
          parsedOk = false
        }
      }

      if (currentEvent === 'error') {
        const message = parsed?.message || dataStr || '流式请求失败'
        const error = new Error(message)
        error.data = parsed
        throw error
      }

      if (currentEvent === 'done') {
        if (parsed?.usage) {
          usage = parsed.usage
        }
        if (!skipLog) {
          console.log('✅ [流式响应] 完成')
        }
        await reader.cancel()
        return true
      }

      let delta = null
      if (parsedOk) {
        if (typeof parsed?.content === 'string') {
          delta = parsed.content
        } else if (typeof parsed?.choices?.[0]?.delta?.content === 'string') {
          delta = parsed.choices[0].delta.content
        } else if (typeof parsed?.choices?.[0]?.message?.content === 'string') {
          delta = parsed.choices[0].message.content
        }

        if (parsed?.usage) {
          usage = parsed.usage
        }
      } else if (dataStr) {
        delta = dataStr
      }

      if (delta) {
        fullContent += delta
        if (DEBUG_STREAMING_OUTPUT) {
          console.log(`[streamPost][${requestMethod}] ${url}`, delta)
        }
        if (onChunk) {
          onChunk(delta)
        }
      }

      currentEvent = null
      return false
    }

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        const trimmedLine = line.trimEnd()
        if (!trimmedLine) {
          const shouldReturn = await flushSseEvent()
          if (shouldReturn) {
            return { content: fullContent, usage }
          }
          continue
        }

        if (trimmedLine.startsWith('event:')) {
          currentEvent = trimmedLine.slice(6).trim()
          continue
        }

        if (trimmedLine.startsWith('data:')) {
          const dataPart = trimmedLine.slice(5).trimStart()
          if (/^id:\s*\S+$/i.test(dataPart)) {
            continue
          }
          pendingDataLines.push(dataPart)
          continue
        }

        if (trimmedLine.startsWith('id:') || trimmedLine.startsWith('retry:')) {
          continue
        }

        pendingDataLines.push(trimmedLine)
      }
    }

    if (pendingDataLines.length > 0) {
      await flushSseEvent()
    }

    // 9. 打印响应日志
    if (!skipLog) {
      console.group(`✅ HTTP 流式响应: ${requestMethod} ${url}`)
      console.log('📊 内容长度:', fullContent.length, '字符')
      console.log('📊 Usage:', usage)
      console.log('⏰ 完成时间:', new Date().toLocaleString())
      console.groupEnd()
    }

    return {
      content: fullContent,
      usage
    }
  } catch (error) {
    // 10. 错误处理
    if (error.name === 'AbortError') {
      if (!skipLog) {
        console.log('⏹️ [流式请求] 已中断')
      }
      // 重新抛出，让调用方知道是用户主动中断
      throw error
    }

    if (!skipLog && !error.message.startsWith('请求失败')) {
      console.group(`❌ HTTP 流式请求异常: POST ${url}`)
      console.error('错误详情:', error)
      console.groupEnd()
    }
    throw error
  }
}
