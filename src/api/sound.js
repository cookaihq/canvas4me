/**
 * MiniMax 声音相关 API
 *
 * 封装以下 6 个 ai-canvas 声音能力端点：
 * 1. GET  /api/apps/ai-canvas/v1/sound/minimax-speech/preset-voice-id — 查询预设音色清单（裸数组响应）
 * 2. GET  /api/apps/ai-canvas/v1/sound/minimax-voice-clone/voices — 列出团队克隆音色
 * 3. GET  /api/apps/ai-canvas/v1/sound/minimax-voice-clone/voices/favorites — 列出用户收藏的克隆音色
 * 4. POST /api/apps/ai-canvas/v1/sound/minimax-voice-clone/voice/{voice_id}/favorite — 收藏/取消收藏
 * 5. PATCH /api/apps/ai-canvas/v1/sound/minimax-voice-clone/voice/{voice_id} — 修改音色信息
 * 6. POST /api/apps/ai-canvas/v1/node/sound/minimax-voice-clone/submit — 提交音色克隆任务
 *
 * 响应说明：
 * - 接口 1：后端直接返回 JSON 数组，不走 {code,message,data} 包装，故直接调 utils/request 而非 apiClient
 * - 接口 2-6：走标准 {code,message,data} 包装，由 apiClient 自动 unwrap
 */

import apiClient from './client'
import { request } from '@/utils/request'
import { tokenManager } from '@/utils/tokenManager'
import { getGlobalTeamId } from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8171'

/**
 * 查询 MiniMax Speech 预设音色清单（扩展 673 条）
 *
 * 返回是裸数组，后端不走 {code,message,data} 包装。
 *
 * @param {string} language - 语言: 'zh' (中文) 或 'en' (英文)，默认 'zh'
 * @returns {Promise<Array<{id, voice_id, voice_name, tag_list, cover_url, sample_audio, description}>>}
 */
export const listPresetVoices = async (language = 'zh') => {
  const lang = language === 'en' ? 'en' : 'zh'

  const accessToken = tokenManager.getAccessToken()
  const cachedUser = tokenManager.getUser()
  const teamId = getGlobalTeamId() || cachedUser?.default_team_id || cachedUser?.defaultTeamId

  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  if (teamId) headers['X-Team-ID'] = teamId

  const endpoint = '/api/apps/ai-canvas/v1/sound/minimax-speech/preset-voice-id'
  const data = await request(`${API_BASE}${endpoint}?language=${lang}`, {
    method: 'GET',
    headers,
    expectApiResponse: false, // 后端直接返回数组，不带 {code,message,data} 信封
  })

  return Array.isArray(data) ? data : []
}

/**
 * 查询当前团队已克隆的音色列表
 *
 * @returns {Promise<Array<{id, voice_id, voice_name, tag_list, sample_audio, description, language, accent, gender, age, reference_audio_url, reference_audio_text, created_at, favorited}>>}
 */
export const listMyVoices = () =>
  apiClient.get('/api/apps/ai-canvas/v1/sound/minimax-voice-clone/voices')

/**
 * 查询当前用户收藏的克隆音色列表
 *
 * @returns {Promise<Array<{id, voice_id, voice_name, tag_list, sample_audio, description, language, accent, gender, age, reference_audio_url, reference_audio_text, created_at, favorited}>>}
 */
export const listFavoritedVoices = () =>
  apiClient.get('/api/apps/ai-canvas/v1/sound/minimax-voice-clone/voices/favorites')

/**
 * 收藏/取消收藏一个克隆音色
 *
 * @param {string} voiceId - 音色 ID
 * @param {boolean} favorited - true 收藏，false 取消收藏
 * @returns {Promise<{id, voice_id, voice_name, tag_list, sample_audio, description, language, accent, gender, age, reference_audio_url, reference_audio_text, created_at, favorited}>}
 */
export const toggleFavoriteVoice = (voiceId, favorited) =>
  apiClient.post(`/api/apps/ai-canvas/v1/sound/minimax-voice-clone/voice/${voiceId}/favorite`, {
    favorited,
  })

/**
 * 修改克隆音色信息（部分更新）
 *
 * @param {string} voiceId - 音色 ID
 * @param {object} patch - 修改内容，支持字段：voice_name, tag_list, description, language, accent, gender, age
 * @returns {Promise<{id, voice_id, voice_name, tag_list, sample_audio, description, language, accent, gender, age, reference_audio_url, reference_audio_text, created_at, favorited}>}
 */
export const updateVoice = (voiceId, patch) =>
  apiClient.request(`/api/apps/ai-canvas/v1/sound/minimax-voice-clone/voice/${voiceId}`, {
    method: 'PATCH',
    body: patch,
  })

/**
 * 提交音色克隆任务
 *
 * @param {string} projectId - 画布项目 ID
 * @param {string} nodeId - 节点 ID
 * @param {string} audioUrl - 参考音频 URL
 * @param {string} [text] - 克隆文本，可选，仅在 truthy 时加入请求体
 * @param {string} [extraTaskId] - 服务端 extra_task_id，可选，仅在 truthy 时加入请求体
 * @returns {Promise<object>} Task 对象快照(`{id, project_id, node_id, status, ...}`)
 */
export const submitClone = (projectId, nodeId, audioUrl, text, extraTaskId) => {
  const body = {
    project_id: projectId,
    node_id: nodeId,
    audio_url: audioUrl,
  }
  if (text) body.text = text
  if (extraTaskId) body.extra_task_id = extraTaskId

  return apiClient.post('/api/apps/ai-canvas/v1/node/sound/minimax-voice-clone/submit', body)
}
