const STORAGE_PREFIX = 'ai-tools:notify-inbox-sound'
const DEFAULT_BEEP_FREQUENCY_HZ = 880
const DEFAULT_BEEP_DURATION_MS = 160
const DEFAULT_BEEP_VOLUME = 0.04
const LOCAL_STORAGE_LOCK_TTL_MS = 2_000

const SOUND_CONFIG_KEY_PREFIX = `${STORAGE_PREFIX}:config`
const DEFAULT_SOUND_URL = 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/phone-vibration.wav'

export const NOTIFY_INBOX_SOUND_PRESETS = [
  { key: 'phone-vibration', label: '手机震动', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/phone-vibration.wav' },
  { key: 'rooster', label: '公鸡', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/rooster.wav' },
  { key: 'cow-mooing', label: '牛叫', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/cow-mooing.wav' },
  { key: 'abstract-4', label: '抽象音 4', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/abstract-sound4.wav' },
  { key: 'abstract-3', label: '抽象音 3', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/abstract-sound3.wav' },
  { key: 'abstract-2', label: '抽象音 2', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/abstract-sound2.wav' },
  { key: 'abstract-1', label: '抽象音 1', url: 'https://ftapp.oss-cn-beijing.aliyuncs.com/aitools/sounds/abstract-sound1.wav' },
]

let soundPrepared = false
let audioContext = null
let localStorageAvailable = null
let notifyAudio = null
let userInteracted = false

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeSoundUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

function safeJsonParse(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function canUseLocalStorage() {
  if (localStorageAvailable !== null) return localStorageAvailable
  try {
    if (typeof window === 'undefined') {
      localStorageAvailable = false
      return localStorageAvailable
    }
    if (!window.localStorage) {
      localStorageAvailable = false
      return localStorageAvailable
    }
    const testKey = `${STORAGE_PREFIX}:__test__`
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    localStorageAvailable = true
    return localStorageAvailable
  } catch {
    localStorageAvailable = false
    return localStorageAvailable
  }
}

function getOrCreateTabId() {
  if (typeof window === 'undefined') return 'server'
  const key = `${STORAGE_PREFIX}:tab_id`
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing && existing.trim()) return existing
    const tabId = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.sessionStorage.setItem(key, tabId)
    return tabId
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext
  if (!AudioContextImpl) return null
  if (!audioContext) audioContext = new AudioContextImpl()
  return audioContext
}

async function ensureAudioUnlocked() {
  userInteracted = true
  const ctx = getAudioContext()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    return ctx.state === 'running' || ctx.state === 'suspended'
  } catch {
    return false
  }
}

export function prepareNotifyInboxSound() {
  if (soundPrepared) return
  soundPrepared = true
  if (typeof window === 'undefined') return

  const unlockOnce = () => {
    userInteracted = true
    ensureAudioUnlocked().catch(() => null)
  }

  window.addEventListener('pointerdown', unlockOnce, { capture: true, once: true })
  window.addEventListener('keydown', unlockOnce, { capture: true, once: true })
}

export async function playNotifyInboxBeep(options = {}) {
  const ctx = getAudioContext()
  if (!ctx) return false

  const frequency = isFiniteNumber(options.frequencyHz) ? options.frequencyHz : DEFAULT_BEEP_FREQUENCY_HZ
  const durationMs = isFiniteNumber(options.durationMs) ? options.durationMs : DEFAULT_BEEP_DURATION_MS
  const volume = isFiniteNumber(options.volume) ? options.volume : DEFAULT_BEEP_VOLUME

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    if (ctx.state !== 'running') {
      return false
    }

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)
    gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start()
    oscillator.stop(ctx.currentTime + durationMs / 1000)

    return true
  } catch (error) {
    console.warn('[notifyInboxSound] 播放通知音失败:', error?.message || error)
    return false
  }
}

function getOrCreateNotifyAudio() {
  if (typeof window === 'undefined') return null
  if (!notifyAudio) {
    notifyAudio = new Audio()
    notifyAudio.preload = 'auto'
  }
  return notifyAudio
}

export function getNotifyInboxSoundConfig({ userKey } = {}) {
  const fallback = { enabled: true, soundUrl: DEFAULT_SOUND_URL }
  if (!userKey) return fallback
  if (!canUseLocalStorage()) return fallback

  const key = `${SOUND_CONFIG_KEY_PREFIX}:${userKey}`
  try {
    const parsed = safeJsonParse(window.localStorage.getItem(key))
    if (!parsed || typeof parsed !== 'object') return fallback
    const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled
    const soundUrl = normalizeSoundUrl(parsed.soundUrl ?? parsed.sound_url) || fallback.soundUrl
    return { enabled, soundUrl }
  } catch {
    return fallback
  }
}

export function getNotifyInboxSoundConfigStorageKey(userKey) {
  if (!userKey) return null
  return `${SOUND_CONFIG_KEY_PREFIX}:${userKey}`
}

export function setNotifyInboxSoundConfig({ userKey, enabled, soundUrl }) {
  if (!userKey) return false
  if (!canUseLocalStorage()) return false
  const key = getNotifyInboxSoundConfigStorageKey(userKey)
  if (!key) return false
  try {
    window.localStorage.setItem(key, JSON.stringify({
      enabled: typeof enabled === 'boolean' ? enabled : true,
      soundUrl: normalizeSoundUrl(soundUrl) || DEFAULT_SOUND_URL,
      updatedAt: Date.now(),
    }))
    return true
  } catch (error) {
    console.warn('[notifyInboxSound] 保存通知音配置失败:', error?.message || error)
    return false
  }
}

export function preloadNotifyInboxSound(soundUrl) {
  const url = normalizeSoundUrl(soundUrl)
  if (!url || typeof window === 'undefined') return false
  try {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.src = url
    audio.load()
    return true
  } catch {
    return false
  }
}

export async function playNotifyInboxSound({ soundUrl, volume = 1 } = {}) {
  const url = normalizeSoundUrl(soundUrl)
  if (!url) {
    return playNotifyInboxBeep()
  }

  const audio = getOrCreateNotifyAudio()
  if (!audio) return false

  try {
    audio.pause()
    audio.currentTime = 0
  } catch {
    // ignore
  }

  try {
    if (audio.src !== url) {
      audio.src = url
    }
    audio.volume = Math.max(0, Math.min(1, volume))
    await audio.play()
    return true
  } catch (error) {
    const playedByBeep = userInteracted ? await playNotifyInboxBeep() : false
    console.warn('[notifyInboxSound] 播放通知音失败，已回退:', error?.message || error)
    return playedByBeep
  }
}

export function extractInboxToken(item) {
  if (!item || typeof item !== 'object') return null

  const rawId = item.id
  let id = null
  if (isFiniteNumber(rawId)) {
    id = rawId
  } else if (typeof rawId === 'string') {
    const trimmed = rawId.trim()
    if (trimmed && Number.isFinite(Number(trimmed))) {
      id = Number(trimmed)
    }
  }

  const rawCreatedAt = item.created_at ?? item.createdAt
  let createdAtMs = null
  if (typeof rawCreatedAt === 'string') {
    const parsed = Date.parse(rawCreatedAt)
    if (Number.isFinite(parsed)) createdAtMs = parsed
  } else if (rawCreatedAt instanceof Date) {
    const parsed = rawCreatedAt.getTime()
    if (Number.isFinite(parsed)) createdAtMs = parsed
  } else if (isFiniteNumber(rawCreatedAt)) {
    createdAtMs = rawCreatedAt
  }

  if (!isFiniteNumber(id) && !isFiniteNumber(createdAtMs)) return null
  return { id, createdAtMs }
}

function buildStateKey(userKey, teamId) {
  const safeUser = userKey || 'unknown-user'
  const safeTeam = teamId || 'unknown-team'
  return `${STORAGE_PREFIX}:state:${safeUser}:${safeTeam}`
}

function buildLockKey(userKey, teamId) {
  const safeUser = userKey || 'unknown-user'
  const safeTeam = teamId || 'unknown-team'
  return `${STORAGE_PREFIX}:lock:${safeUser}:${safeTeam}`
}

function readState(stateKey) {
  if (!canUseLocalStorage()) return null
  try {
    const raw = window.localStorage.getItem(stateKey)
    const parsed = safeJsonParse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const lastNotifiedId = isFiniteNumber(parsed.lastNotifiedId) ? parsed.lastNotifiedId : null
    const lastNotifiedCreatedAtMs = isFiniteNumber(parsed.lastNotifiedCreatedAtMs) ? parsed.lastNotifiedCreatedAtMs : null
    const updatedAt = isFiniteNumber(parsed.updatedAt) ? parsed.updatedAt : null

    if (!isFiniteNumber(lastNotifiedId) && !isFiniteNumber(lastNotifiedCreatedAtMs)) return null
    return { lastNotifiedId, lastNotifiedCreatedAtMs, updatedAt }
  } catch {
    return null
  }
}

function writeState(stateKey, nextState) {
  if (!canUseLocalStorage()) return false
  try {
    window.localStorage.setItem(stateKey, JSON.stringify(nextState))
    return true
  } catch (error) {
    console.warn('[notifyInboxSound] 保存去重状态失败:', error?.message || error)
    return false
  }
}

function isTokenNewer(token, state) {
  if (!token) return false
  if (!state) return true

  if (isFiniteNumber(token.id) && isFiniteNumber(state.lastNotifiedId)) {
    return token.id > state.lastNotifiedId
  }

  if (isFiniteNumber(token.createdAtMs) && isFiniteNumber(state.lastNotifiedCreatedAtMs)) {
    return token.createdAtMs > state.lastNotifiedCreatedAtMs
  }

  if (isFiniteNumber(token.id) && !isFiniteNumber(state.lastNotifiedId)) return true
  if (isFiniteNumber(token.createdAtMs) && !isFiniteNumber(state.lastNotifiedCreatedAtMs)) return true

  return false
}

async function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function withLocalStorageLock(lockKey, fn) {
  if (!canUseLocalStorage()) {
    return fn()
  }

  const mutexKey = `${STORAGE_PREFIX}:mutex:${lockKey}`
  const tabId = getOrCreateTabId()
  const token = `${tabId}:${Date.now()}:${Math.random().toString(16).slice(2)}`
  const record = { token, expiresAt: Date.now() + LOCAL_STORAGE_LOCK_TTL_MS }

  try {
    window.localStorage.setItem(mutexKey, JSON.stringify(record))
  } catch {
    return fn()
  }

  await sleep(20 + Math.floor(Math.random() * 30))

  const current = safeJsonParse(window.localStorage.getItem(mutexKey))
  if (!current || current.token !== token) return null
  if (isFiniteNumber(current.expiresAt) && current.expiresAt < Date.now()) return null

  try {
    return await fn()
  } finally {
    const latest = safeJsonParse(window.localStorage.getItem(mutexKey))
    if (latest && latest.token === token) {
      window.localStorage.removeItem(mutexKey)
    }
  }
}

async function withCrossTabLock(lockKey, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(lockKey, fn)
  }
  return withLocalStorageLock(lockKey, fn)
}

export async function ensureNotifyInboxSoundBaseline({ userKey, teamId, initialToken }) {
  if (typeof window === 'undefined') return false
  if (!userKey || !teamId) return false

  const stateKey = buildStateKey(userKey, teamId)
  const lockKey = buildLockKey(userKey, teamId)

  const result = await withCrossTabLock(lockKey, async () => {
    const existing = readState(stateKey)
    if (existing) return true

    const baselineId = isFiniteNumber(initialToken?.id) ? initialToken.id : 0
    const baselineCreatedAtMs = isFiniteNumber(initialToken?.createdAtMs) ? initialToken.createdAtMs : 0

    return writeState(stateKey, {
      lastNotifiedId: baselineId,
      lastNotifiedCreatedAtMs: baselineCreatedAtMs,
      updatedAt: Date.now(),
    })
  })

  return Boolean(result)
}

export async function maybePlayNotifyInboxSound({ userKey, teamId, latestToken }) {
  if (typeof window === 'undefined') return false
  if (!userKey || !teamId) return false
  if (!latestToken) return false

  const soundConfig = getNotifyInboxSoundConfig({ userKey })
  if (!soundConfig.enabled) return false

  const stateKey = buildStateKey(userKey, teamId)
  const lockKey = buildLockKey(userKey, teamId)

  const result = await withCrossTabLock(lockKey, async () => {
    const currentState = readState(stateKey)
    if (!currentState) {
      writeState(stateKey, {
        lastNotifiedId: isFiniteNumber(latestToken.id) ? latestToken.id : 0,
        lastNotifiedCreatedAtMs: isFiniteNumber(latestToken.createdAtMs) ? latestToken.createdAtMs : 0,
        updatedAt: Date.now(),
      })
      return false
    }

    if (!isTokenNewer(latestToken, currentState)) return false

    const played = await playNotifyInboxSound({ soundUrl: soundConfig.soundUrl })
    if (!played) return false

    writeState(stateKey, {
      lastNotifiedId: isFiniteNumber(latestToken.id) ? latestToken.id : currentState.lastNotifiedId,
      lastNotifiedCreatedAtMs: isFiniteNumber(latestToken.createdAtMs)
        ? latestToken.createdAtMs
        : currentState.lastNotifiedCreatedAtMs,
      updatedAt: Date.now(),
    })

    return true
  })

  return Boolean(result)
}
