/**
 * OSS 上传工具
 * 支持 base64 和 URL 两种格式的文件上传
 */

import OSS from 'ali-oss'
import { getOSSConfig } from './config'
import { requestRaw } from './request'

/**
 * 创建 OSS 客户端
 */
const createOSSClient = async () => {
  const config = await getOSSConfig()

  if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.region) {
    throw new Error('OSS 配置不完整，请在设置中配置')
  }

  return new OSS({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    region: config.region,
    secure: true  // 强制使用 HTTPS 协议
  })
}

/**
 * 从 base64 字符串中提取 MIME 类型和数据
 */
const parseBase64 = (base64String) => {
  const matches = base64String.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('无效的 base64 格式')
  }

  return {
    mimeType: matches[1],
    data: matches[2]
  }
}

/**
 * 根据 MIME 类型获取文件扩展名
 */
const getExtensionFromMimeType = (mimeType) => {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'application/pdf': 'pdf',
    'application/json': 'json',
    'text/plain': 'txt'
  }

  return mimeMap[mimeType] || 'bin'
}

/**
 * 从 URL 获取文件扩展名
 * 如果 URL 中没有扩展名，尝试从响应头获取
 */
const getExtensionFromUrl = async (url) => {
  // 处理 base64 URL：从 data:image/png;base64,... 中提取 MIME 类型
  if (url.startsWith('data:')) {
    const mimeMatch = url.match(/^data:([^;]+);/)
    if (mimeMatch) {
      return getExtensionFromMimeType(mimeMatch[1])
    }
  }

  // 先尝试从 URL 中提取扩展名
  const urlMatch = url.match(/\.([a-zA-Z0-9]+)(\?|$)/)
  if (urlMatch) {
    return urlMatch[1].toLowerCase()
  }

  // 如果没有，尝试从响应头获取
  try {
    const response = await requestRaw(url, {
      method: 'HEAD',
      skipLog: false,
    })
    const contentType = response.headers.get('content-type')
    if (contentType) {
      const mimeType = contentType.split(';')[0].trim()
      return getExtensionFromMimeType(mimeType)
    }
  } catch (error) {
    console.warn('无法从响应头获取文件类型:', error)
  }

  return 'bin'
}

/**
 * 生成文件路径
 * 格式：{根目录}/{应用名}/{日期}/{时分秒毫秒}-{原文件名}
 */
const generateFilePath = async (appId, originalFilename, extension) => {
  const config = await getOSSConfig()
  const now = new Date()

  // 日期格式：20251112
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')

  // 时分秒毫秒格式：143025123
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '') +
               now.getMilliseconds().toString().padStart(3, '0')

  // 清理原始文件名（移除扩展名）
  let basename = originalFilename || 'file'
  const lastDotIndex = basename.lastIndexOf('.')
  if (lastDotIndex > 0) {
    basename = basename.slice(0, lastDotIndex)
  }

  // 清理文件名中的特殊字符
  basename = basename.replace(/[^a-zA-Z0-9_-]/g, '_')

  // 构建完整路径
  const filename = `${time}-${basename}.${extension}`
  const rootDir = config.rootDir.replace(/^\/|\/$/g, '') // 移除首尾斜杠

  return `${rootDir}/${appId}/${date}/${filename}`
}

/**
 * 测试 OSS 连接是否有效
 * @param {object} config - OSS 配置 { accessKeyId, accessKeySecret, bucket, region }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const testOSSConnection = async (config) => {
  try {
    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.region) {
      return { success: false, message: 'OSS 配置不完整' }
    }

    const client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      secure: true,
      timeout: 10000  // 10秒超时
    })

    // 尝试列出 bucket 中的文件（最多1个）来验证连接
    await client.list({ 'max-keys': 1 })
    return { success: true, message: 'OSS 连接成功' }
  } catch (error) {
    console.error('❌ [User OSS] 连接测试失败:', error)

    // 根据错误类型给出可操作的提示
    if (error.code === 'InvalidAccessKeyId') {
      return { success: false, message: 'Access Key ID 无效，请检查后重试' }
    }
    if (error.code === 'SignatureDoesNotMatch') {
      return { success: false, message: 'Access Key Secret 无效，请检查后重试' }
    }
    if (error.code === 'NoSuchBucket') {
      return { success: false, message: `Bucket「${config.bucket}」不存在，请检查名称和 Region 是否匹配` }
    }

    // 网络连接失败 / CORS 拦截：浏览器直连 OSS 需要 Bucket 开启 CORS
    const isNetworkError = error.status === -1
      || error.name === 'RequestError'
      || (error.message && /net(work)?|XHR|CORS|Failed to fetch/i.test(error.message))
    if (isNetworkError) {
      const endpoint = `${config.bucket}.${config.region}.aliyuncs.com`
      return {
        success: false,
        message: `无法连接 ${endpoint}，请检查：\n`
          + `1. Bucket 的 Region 是否正确（当前：${config.region}）\n`
          + `2. Bucket 需开启 CORS：来源填「*」，允许 Methods 勾选「GET」，允许 Headers 填「*」\n`
          + `3. 设置路径：OSS 控制台 → Bucket → 数据安全 → 跨域设置`,
      }
    }

    return { success: false, message: error.message || '连接失败，请检查配置' }
  }
}

/**
 * 从 base64 上传到 OSS
 * @param {string} base64String - base64 字符串
 * @param {string} appId - 应用 ID
 * @param {string} originalFilename - 原始文件名（可选）
 * @returns {Promise<string>} - OSS 文件 URL
 */
export const uploadBase64ToOSS = async (base64String, appId, originalFilename = 'file') => {
  console.log('📤 [User OSS] 正在上传 base64 文件到 OSS:', { appId, originalFilename })
  try {
    const client = await createOSSClient()
    const { mimeType, data } = parseBase64(base64String)

    // 获取文件扩展名
    const extension = getExtensionFromMimeType(mimeType)

    // 生成文件路径
    const filePath = await generateFilePath(appId, originalFilename, extension)

    // 将 base64 转换为 Blob（浏览器环境）
    const byteCharacters = atob(data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })

    // 上传到 OSS
    // 根据文件大小设置超时时间
    const fileSizeMB = blob.size / (1024 * 1024);
    const timeoutSeconds = Math.max(60, 60 + Math.ceil(fileSizeMB) * 10);

    const result = await client.put(filePath, blob, {
      headers: {
        'Content-Type': mimeType
      },
      timeout: timeoutSeconds * 1000
    })

    // 返回访问 URL
    const accessUrl = await getAccessUrl(result.name)
    console.log('✅ [User OSS] base64 文件上传成功:', accessUrl)
    return accessUrl
  } catch (error) {
    console.error('上传 base64 到 OSS 失败:', error)

    // 提供更友好的错误信息
    if (error.name === 'ConnectionTimeoutError' || error.code === 'ConnectionTimeoutError') {
      throw new Error('上传超时，请检查网络连接或稍后重试')
    } else if (error.status === 403) {
      throw new Error('OSS 权限不足，请检查配置')
    } else {
      throw new Error(error.message || '上传失败，请重试')
    }
  }
}

/**
 * 从 URL 下载文件并上传到 OSS
 * @param {string} fileUrl - 文件 URL
 * @param {string} appId - 应用 ID
 * @param {string} originalFilename - 原始文件名（可选）
 * @returns {Promise<string>} - OSS 文件 URL
 */
export const uploadUrlToOSS = async (fileUrl, appId, originalFilename = '') => {
  console.log('📤 [User OSS] 正在下载并上传 URL 文件到 OSS:', { appId, originalFilename, fileUrl })
  try {
    // 如果没有提供原始文件名，尝试从 URL 中提取
    if (!originalFilename) {
      const urlParts = fileUrl.split('/')
      originalFilename = urlParts[urlParts.length - 1].split('?')[0]
    }

    // 获取文件扩展名
    const extension = await getExtensionFromUrl(fileUrl)

    // 下载文件
    const response = await requestRaw(fileUrl, {
      method: 'GET',
      skipLog: false,
    })
    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.statusText}`)
    }

    const blob = await response.blob()

    // 创建 OSS 客户端
    const client = await createOSSClient()

    // 生成文件路径
    const filePath = await generateFilePath(appId, originalFilename, extension)

    // 上传到 OSS（直接使用 Blob）
    // 根据文件大小设置超时时间
    const fileSizeMB = blob.size / (1024 * 1024);
    const timeoutSeconds = Math.max(60, 60 + Math.ceil(fileSizeMB) * 10);

    console.log(`⏱️ [User OSS] 文件大小: ${fileSizeMB.toFixed(2)} MB, 超时设置: ${timeoutSeconds} 秒`);

    const result = await client.put(filePath, blob, {
      headers: {
        'Content-Type': blob.type || 'application/octet-stream'
      },
      timeout: timeoutSeconds * 1000
    })

    // 返回访问 URL
    const accessUrl = await getAccessUrl(result.name)
    console.log('✅ [User OSS] URL 文件上传成功:', accessUrl)
    return accessUrl
  } catch (error) {
    console.error('上传 URL 到 OSS 失败:', error)

    // 提供更友好的错误信息
    if (error.name === 'ConnectionTimeoutError' || error.code === 'ConnectionTimeoutError') {
      throw new Error(`上传超时，文件可能过大或网络较慢。建议：\n1. 检查网络连接\n2. 尝试上传较小的文件\n3. 稍后重试`)
    } else if (error.status === 403) {
      throw new Error('OSS 权限不足，请检查配置中的 AccessKey 是否正确')
    } else if (error.status === 404) {
      throw new Error('OSS Bucket 不存在，请检查配置中的 Bucket 名称')
    } else {
      throw new Error(error.message || '上传失败，请重试')
    }
  }
}

/**
 * 直接上传 File 对象到 OSS
 * @param {File} file - File 对象
 * @param {string} appId - 应用 ID
 * @param {string} originalFilename - 原始文件名（可选，默认使用 file.name）
 * @param {Function} onProgress - 进度回调函数 (percent) => void
 * @returns {Promise<string>} - OSS 文件 URL
 */
export const uploadFileToOSS = async (file, appId, originalFilename = '', onProgress = null) => {
  if (!file || !(file instanceof File || file instanceof Blob)) {
    throw new Error('无效的文件对象')
  }

  console.log('📤 [User OSS] 正在上传 File 对象到 OSS:', { appId, originalFilename, fileName: file.name })
  try {
    const client = await createOSSClient()

    // 获取文件名和扩展名
    const filename = originalFilename || file.name || 'file'
    const extension = filename.includes('.')
      ? filename.split('.').pop().toLowerCase()
      : getExtensionFromMimeType(file.type)

    // 生成文件路径
    const filePath = await generateFilePath(appId, filename, extension)

    // 上传到 OSS（File 继承自 Blob，可以直接使用）
    // 根据文件大小设置超时时间：基础 60 秒 + 每 MB 额外 10 秒
    const fileSizeMB = file.size / (1024 * 1024);
    const timeoutSeconds = Math.max(60, 60 + Math.ceil(fileSizeMB) * 10); // 最少 60 秒

    console.log(`⏱️ [User OSS] 文件大小: ${fileSizeMB.toFixed(2)} MB, 超时设置: ${timeoutSeconds} 秒`);

    const result = await client.put(filePath, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream'
      },
      timeout: timeoutSeconds * 1000,  // 转换为毫秒
      progress: onProgress ? (p) => {
        // ali-oss 的 progress 回调参数 p 是一个 0-1 的小数
        const percent = Math.floor(p * 100);
        console.log(`📊 [User OSS] 上传进度: ${percent}%`);
        onProgress(percent);
      } : undefined
    })

    // 返回访问 URL
    const accessUrl = await getAccessUrl(result.name)
    console.log('✅ [User OSS] File 对象上传成功:', accessUrl)
    return accessUrl
  } catch (error) {
    console.error('上传 File 到 OSS 失败:', error)

    // 提供更友好的错误信息
    if (error.name === 'ConnectionTimeoutError' || error.code === 'ConnectionTimeoutError') {
      throw new Error(`上传超时，文件可能过大或网络较慢。建议：\n1. 检查网络连接\n2. 尝试上传较小的文件\n3. 稍后重试`)
    } else if (error.status === 403) {
      throw new Error('OSS 权限不足，请检查配置中的 AccessKey 是否正确')
    } else if (error.status === 404) {
      throw new Error('OSS Bucket 不存在，请检查配置中的 Bucket 名称')
    } else {
      throw new Error(error.message || '上传失败，请重试')
    }
  }
}

/**
 * 通用上传函数，自动判断 base64 还是 URL
 * @param {string} fileData - base64 字符串或 URL
 * @param {string} appId - 应用 ID
 * @param {string} originalFilename - 原始文件名（可选）
 * @returns {Promise<string>} - OSS 文件 URL
 */
export const uploadToOSS = async (fileData, appId, originalFilename = '') => {
  if (!fileData) {
    throw new Error('文件数据不能为空')
  }

  // 如果是 URL，检查是否已经是 OSS URL
  if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
    const config = await getOSSConfig()
    const urlObj = new URL(fileData)

    // 检查是否是 OSS 域名
    const isOSSUrl =
      // 自定义域名
      (config.customDomain && urlObj.origin === new URL(config.customDomain).origin) ||
      // 默认 OSS 域名格式：bucket.region.aliyuncs.com
      urlObj.host.includes('.aliyuncs.com')

    if (isOSSUrl) {
      console.log('🔄 [User OSS] 已经是 OSS URL，跳过转存:', fileData)
      return fileData
    }

    // 不是 OSS URL，需要转存
    return uploadUrlToOSS(fileData, appId, originalFilename)
  }

  // 判断是 base64
  if (fileData.startsWith('data:')) {
    return uploadBase64ToOSS(fileData, appId, originalFilename)
  }

  throw new Error('不支持的文件格式，只支持 base64 或 URL')
}

/**
 * 获取文件访问 URL
 * @param {string} objectName - OSS 对象名称
 * @returns {string} - 访问 URL
 */
const getAccessUrl = async (objectName) => {
  const config = await getOSSConfig()

  // 如果配置了自定义域名，使用自定义域名
  if (config.customDomain) {
    const domain = config.customDomain.replace(/\/$/, '') // 移除尾部斜杠
    return `${domain}/${objectName}`
  }

  // 否则使用默认的 OSS 域名
  const { bucket, region } = config
  return `https://${bucket}.${region}.aliyuncs.com/${objectName}`
}

/**
 * 从 OSS URL 中提取对象名称
 * @param {string} url - OSS 文件 URL
 * @returns {string|null} - 对象名称，如果无法解析则返回 null
 */
const extractObjectNameFromUrl = async (url) => {
  if (!url) return null

  try {
    const config = await getOSSConfig()
    const urlObj = new URL(url)

    // 检查是否是自定义域名
    if (config.customDomain) {
      const customDomainObj = new URL(config.customDomain)
      if (urlObj.host === customDomainObj.host) {
        // 自定义域名: pathname 就是对象名称（移除开头的斜杠）
        return urlObj.pathname.substring(1)
      }
    }

    // 检查是否是默认 OSS 域名
    const { bucket, region } = config
    const expectedHost = `${bucket}.${region}.aliyuncs.com`
    if (urlObj.host === expectedHost) {
      // 默认域名: pathname 就是对象名称（移除开头的斜杠）
      return urlObj.pathname.substring(1)
    }

    // 如果都不匹配，可能不是这个 OSS 的 URL
    console.warn('URL 不属于当前配置的 OSS:', url)
    return null
  } catch (error) {
    console.error('解析 OSS URL 失败:', error)
    return null
  }
}

/**
 * 从 OSS 删除文件
 * @param {string} url - OSS 文件 URL
 * @returns {Promise<boolean>} - 删除是否成功
 */
export const deleteFromOSS = async (url) => {
  if (!url) {
    console.warn('删除 OSS 文件: URL 为空，跳过删除')
    return true
  }

  // 检查是否是 OSS URL（以 http:// 或 https:// 开头）
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.warn('删除 OSS 文件: 非 HTTP URL，跳过删除:', url)
    return true
  }

  try {
    const objectName = await extractObjectNameFromUrl(url)

    if (!objectName) {
      console.warn('删除 OSS 文件: 无法从 URL 提取对象名称，跳过删除:', url)
      return true
    }

    const client = await createOSSClient()

    console.log('🗑️ 正在删除 OSS 文件:', objectName)

    // 删除文件
    await client.delete(objectName)

    console.log('✅ OSS 文件已删除:', objectName)
    return true
  } catch (error) {
    // 如果文件不存在（NoSuchKey），也算成功
    if (error.code === 'NoSuchKey') {
      console.log('ℹ️ OSS 文件不存在（可能已被删除）:', url)
      return true
    }

    console.error('❌ 删除 OSS 文件失败:', error)
    throw error
  }
}

/**
 * 批量删除 OSS 文件
 * @param {string[]} urls - OSS 文件 URL 数组
 * @returns {Promise<{success: number, failed: number, errors: Array}>} - 删除结果统计
 */
export const batchDeleteFromOSS = async (urls) => {
  if (!urls || urls.length === 0) {
    return { success: 0, failed: 0, errors: [] }
  }

  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  console.log(`🗑️ 批量删除 OSS 文件: ${urls.length} 个`)

  // 并行删除所有文件
  const promises = urls.map(async (url) => {
    try {
      await deleteFromOSS(url)
      results.success++
    } catch (error) {
      results.failed++
      results.errors.push({ url, error: error.message })
    }
  })

  await Promise.allSettled(promises)

  console.log(`✅ OSS 文件删除完成: 成功 ${results.success} 个，失败 ${results.failed} 个`)

  return results
}