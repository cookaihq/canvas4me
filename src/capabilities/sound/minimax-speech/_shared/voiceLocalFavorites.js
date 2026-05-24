/**
 * 预设音色本地收藏 — localStorage
 *
 * 服务端的 toggleFavorite 端点 (`/minimax-voice-clone/voice/{voice_id}/favorite`)
 * 只接受团队克隆音色 voice_id, 对扩展预设 (Afrikaans_female_1_v1 等) 会 404.
 * 这里用 localStorage 兜底, 让用户能收藏 library 里的预设音色.
 * 收藏 tab 渲染时合并: 服务端克隆收藏 + 本地预设收藏 = 完整收藏列表.
 *
 * 数据格式: localStorage[KEY] = JSON.stringify([{voice_id, voice_name, cover_url, sample_audio, language, accent, gender, age, description, tag_list}, ...])
 * 只存渲染需要的字段.
 */

const KEY = 'minimax-speech:preset-favorites'

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('[voiceLocalFavorites] writeAll failed', err)
  }
}

export function getLocalFavorites() {
  return readAll()
}

export function isLocalFavorited(voiceId) {
  if (!voiceId) return false
  return readAll().some(v => v.voice_id === voiceId)
}

/**
 * 添加收藏. voice 必须含 voice_id; 其他字段按需保留 (用于收藏 tab 渲染).
 */
export function addLocalFavorite(voice) {
  if (!voice?.voice_id) return
  const list = readAll()
  if (list.some(v => v.voice_id === voice.voice_id)) return  // 已存在不重复加
  // 只保留收藏 tab 渲染需要的字段
  const compact = {
    voice_id: voice.voice_id,
    voice_name: voice.voice_name || voice.voice_id,
    cover_url: voice.cover_url || null,
    sample_audio: voice.sample_audio || null,
    language: voice.language || null,
    accent: voice.accent || null,
    gender: voice.gender || null,
    age: voice.age || null,
    description: voice.description || null,
    tag_list: Array.isArray(voice.tag_list) ? voice.tag_list : null,
    // 标记来源, 收藏 tab 知道这是本地预设而不是服务端克隆
    __source: 'preset',
  }
  writeAll([compact, ...list])
}

export function removeLocalFavorite(voiceId) {
  if (!voiceId) return
  const list = readAll()
  writeAll(list.filter(v => v.voice_id !== voiceId))
}
