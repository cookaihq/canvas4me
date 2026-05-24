/**
 * 媒体元信息读取工具。
 *
 * 仅用于客户端预估（如积分预估时根据音频时长计算秒数）。不做任何网络请求优化——每次调用
 * 创建一个隐藏 <audio>，浏览器会走浏览器自己的 HTTP 缓存。
 */

const AUDIO_METADATA_TIMEOUT_MS = 10000
const VIDEO_METADATA_TIMEOUT_MS = 15000

/**
 * 读取音频 URL 的时长（秒）。跨域 / 格式不支持时 reject。
 * 通过隐藏 <audio preload="metadata"> 元素获取 duration。
 *
 * @param {string} url - 音频公开可访问 URL
 * @returns {Promise<number>} - 时长（秒，浮点）
 */
export function getAudioDuration(url) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      reject(new Error('invalid audio url'))
      return
    }

    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.muted = true
    // 不设 crossOrigin —— 只读 duration 元信息不需要 CORS，设了反而会在 OSS 不发 CORS 头时失败

    let settled = false
    const cleanup = () => {
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.src = ''
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('audio metadata timeout'))
    }, AUDIO_METADATA_TIMEOUT_MS)

    audio.onloadedmetadata = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const duration = audio.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('audio duration not available'))
        return
      }
      resolve(duration)
    }

    audio.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(new Error('audio load failed'))
    }

    audio.src = url
  })
}

/**
 * 读取视频 URL 的时长（秒）。跨域 / 格式不支持时 reject。
 * 通过隐藏 <video preload="metadata"> 元素获取 duration。
 *
 * @param {string} url - 视频公开可访问 URL
 * @returns {Promise<number>} - 时长（秒，浮点）
 */
export function getVideoDuration(url) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      reject(new Error('invalid video url'))
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    // 不设 crossOrigin —— 只读 duration 元信息不需要 CORS

    let settled = false
    const cleanup = () => {
      video.onloadedmetadata = null
      video.onerror = null
      video.src = ''
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('video metadata timeout'))
    }, VIDEO_METADATA_TIMEOUT_MS)

    video.onloadedmetadata = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const duration = video.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('video duration not available'))
        return
      }
      resolve(duration)
    }

    video.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(new Error('video load failed'))
    }

    video.src = url
  })
}
