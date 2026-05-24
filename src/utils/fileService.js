/**
 * 文件服务统一入口
 * 使用 /api/v1/files/* 接口处理上传、转存、图片代理/转 base64
 */

import { fileApi } from '../api/files'
import { requestRaw } from './request'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const parseBase64Url = (base64Url) => {
  const mimeMatch = base64Url.match(/^data:([^;]+);base64,/)
  const mimeType = mimeMatch ? mimeMatch[1] : DEFAULT_CONTENT_TYPE
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg'
  }
  const ext = extMap[mimeType] || 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const filename = `generated_${timestamp}_${random}.${ext}`
  return { mimeType, filename }
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(blob)
  })

const dataUrlToBlob = (dataUrl) => {
  const [header, data] = dataUrl.split(',')
  const match = header.match(/data:([^;]+);base64/)
  const mimeType = match ? match[1] : DEFAULT_CONTENT_TYPE
  const binaryString = atob(data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

const uploadByPresign = (uploadUrl, file, contentType, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.floor((event.loaded / event.total) * 100)
        onProgress(percent)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`上传失败: HTTP ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('上传失败：网络错误')))
    xhr.addEventListener('timeout', () => reject(new Error('上传超时，请重试')))

    xhr.open('PUT', uploadUrl)
    if (contentType) {
      xhr.setRequestHeader('Content-Type', contentType)
    }
    xhr.timeout = 300000
    xhr.send(file)
  })

export async function uploadFileByPresign(file, options = {}) {
  const {
    filename = file?.name || 'file.bin',
    contentType = file?.type || DEFAULT_CONTENT_TYPE,
    fileSize = file?.size,
    onProgress = null,
    confirm = false,
    purpose = ''
  } = options

  if (!file) {
    throw new Error('请选择文件')
  }

  const presignData = await fileApi.presignUrl({
    filename,
    content_type: contentType,
    file_size: fileSize
  })

  if (presignData?.max_size && fileSize && fileSize > presignData.max_size) {
    throw new Error('文件大小超过限制')
  }

  await uploadByPresign(presignData.upload_url, file, contentType, onProgress)

  if (confirm) {
    await fileApi.confirm({
      file_url: presignData.file_url,
      file_size: fileSize || file?.size || 0,
      purpose: purpose || undefined
    })
  }

  return {
    fileUrl: presignData.file_url,
    fileSize: fileSize || file?.size || 0,
    contentType,
    filename
  }
}

export async function uploadFile(file, appIdOrOptions, maybeOptions) {
  const options = typeof appIdOrOptions === 'object' && appIdOrOptions !== null
    ? appIdOrOptions
    : (maybeOptions || {})
  const { filename = '', contentType = '', onProgress = null, supportBase64 = false } = options

  if (typeof file === 'string' && supportBase64) {
    if (file.startsWith('data:')) {
      const { mimeType, filename: generatedFilename } = parseBase64Url(file)
      const result = await uploadFileBySource({
        base64: file,
        filename: filename || generatedFilename,
        contentType: contentType || mimeType
      })
      return { url: result.fileUrl, method: 'tfs' }
    }
    if (file.startsWith('http://') || file.startsWith('https://')) {
      const result = await uploadFileBySource({
        url: file,
        filename: filename || undefined,
        contentType: contentType || undefined
      })
      return { url: result.fileUrl, method: 'tfs' }
    }
  }

  try {
    const result = await uploadFileByPresign(file, {
      filename: filename || file?.name,
      contentType: contentType || file?.type || DEFAULT_CONTENT_TYPE,
      fileSize: file?.size,
      onProgress
    })

    return { url: result.fileUrl, method: 'tfs' }
  } catch (error) {
    const base64Data = await blobToBase64(file)
    const fallbackResult = await uploadFileBySource({
      base64: base64Data,
      filename: filename || file?.name,
      contentType: contentType || file?.type || DEFAULT_CONTENT_TYPE
    })

    return {
      url: fallbackResult.fileUrl,
      method: 'tfs',
      fallback: true,
      fallbackReason: '预签名上传失败，已通过 Base64 转存'
    }
  }
}

export async function uploadFiles(files, appIdOrOptions, maybeOptions) {
  const options = typeof appIdOrOptions === 'object' && appIdOrOptions !== null
    ? appIdOrOptions
    : (maybeOptions || {})

  if (!files || files.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    files.map(file => uploadFile(file, options))
  )

  return results.map((result, index) => {
    const file = files[index]
    if (result.status === 'fulfilled') {
      return { file, ...result.value, error: null }
    }
    return {
      file,
      url: null,
      method: null,
      error: result.reason?.message || '上传失败'
    }
  })
}

export async function uploadFromUrl(fileUrl, appIdOrOptions, maybeOptions) {
  const options = typeof appIdOrOptions === 'object' && appIdOrOptions !== null
    ? appIdOrOptions
    : (maybeOptions || {})
  const { filename = '', contentType = '' } = options

  if (!fileUrl) {
    throw new Error('URL 不能为空')
  }

  if (fileUrl.startsWith('data:')) {
    const { mimeType, filename: generatedFilename } = parseBase64Url(fileUrl)
    const result = await uploadFileBySource({
      base64: fileUrl,
      filename: filename || generatedFilename,
      contentType: contentType || mimeType
    })
    return {
      url: result.fileUrl,
      method: 'tfs',
      originalUrl: fileUrl,
      finalUrl: fileUrl
    }
  }

  const result = await uploadFileBySource({
    url: fileUrl,
    filename: filename || undefined,
    contentType: contentType || undefined
  })

  return {
    url: result.fileUrl,
    method: 'tfs',
    originalUrl: fileUrl,
    finalUrl: fileUrl
  }
}

export async function uploadFileBySource(payload = {}) {
  const {
    base64,
    url,
    filename = '',
    contentType = '',
    taskId = '',
    confirm = false,
    purpose = ''
  } = payload

  if ((!base64 && !url) || (base64 && url)) {
    throw new Error('base64 与 url 必须二选一')
  }
  if (base64 && !base64.startsWith('data:') && !contentType) {
    throw new Error('Base64 非 Data URI 时必须提供 content_type')
  }

  const data = await fileApi.upload({
    base64,
    url,
    filename: filename || undefined,
    content_type: contentType || undefined,
    task_id: taskId || undefined
  })

  if (confirm) {
    await fileApi.confirm({
      file_url: data.file_url,
      file_size: data.file_size || 0,
      purpose: purpose || undefined
    })
  }

  return {
    fileUrl: data.file_url,
    fileSize: data.file_size || 0,
    contentType: data.content_type || contentType || DEFAULT_CONTENT_TYPE,
    filename: data.filename || filename
  }
}

export async function convertImageUrlToBase64(imageUrl, options = {}) {
  if (typeof imageUrl !== 'string') {
    throw new Error('图片 URL 无效')
  }

  if (imageUrl.startsWith('data:')) {
    return imageUrl
  }

  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('图片 URL 无效')
  }

  const {
    filename = '',
    contentType = '',
    taskId = '',
    confirm = false,
    purpose = 'image_proxy'
  } = options

  const { fileUrl } = await uploadFileBySource({
    url: imageUrl,
    filename,
    contentType,
    taskId,
    confirm,
    purpose
  })

  const response = await requestRaw(fileUrl, { method: 'GET', skipLog: false })
  const blob = await response.blob()
  return blobToBase64(blob)
}

export async function convertImageToBlob(imageUrl, options = {}) {
  if (typeof imageUrl !== 'string') {
    throw new Error('图片 URL 无效')
  }

  if (imageUrl.startsWith('data:')) {
    return dataUrlToBlob(imageUrl)
  }

  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error('图片 URL 无效')
  }

  const {
    filename = '',
    contentType = '',
    taskId = '',
    confirm = false,
    purpose = 'image_proxy'
  } = options

  const { fileUrl } = await uploadFileBySource({
    url: imageUrl,
    filename,
    contentType,
    taskId,
    confirm,
    purpose
  })

  const response = await requestRaw(fileUrl, { method: 'GET', skipLog: false })
  return response.blob()
}
const buildMarkdownImage = (target, imageUrl) => `![${target}](${imageUrl})`

export default function getUploadPlaceholder(file, onImageUpload) {
  const target = `Uploading_${globalThis.crypto?.randomUUID?.() || Date.now()}`
  const placeholder = buildMarkdownImage(target, '')

  const uploaded = new Promise((resolve, reject) => {
    let usedCallback = true

    const handleUploaded = (url) => {
      resolve(buildMarkdownImage(file?.name || 'image', url))
    }

    try {
      const upload = onImageUpload(file, handleUploaded)
      if (upload && typeof upload.then === 'function') {
        usedCallback = false
        upload.then(handleUploaded).catch(reject)
      }
    } catch (error) {
      reject(error)
      return
    }

    if (usedCallback) {
      return
    }
  })

  return { placeholder, uploaded }
}
