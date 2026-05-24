/**
 * MiniMax Speech builder —— 见 docs/capabilities/sound/minimax-speech.md §"请求示例"
 *
 * 请求体形态 (上游 OpenAPI 一致, 嵌套对象):
 *   {
 *     project_id, node_id,        // 服务端包装字段, 直连上游时翻译层会剥掉; capability/mode 不进 body (URL 段已携带 capability, 后端按 model 分派 schema)
 *     model,                      // speech-2.8-hd / speech-2.8-turbo
 *     prompt,                     // 端口 > 面板 textarea (batch 模式由 expandRuns 覆盖到单段)
 *     voice_setting: {
 *       voice_id, emotion, speed, english_normalization
 *       // pitch / vol 上游支持但本期 UI 不暴露
 *     },
 *     audio_setting: {
 *       format, sample_rate, bitrate, channel
 *     },
 *     language_boost,             // 41 项语言提示
 *     voice_modify,               // 顶层嵌套对象 (按需传, 全 default 时不写入)
 *     pronunciation_dict          // 顶层嵌套对象 (按需传, tone_list 为空时不写入)
 *   }
 *
 * 关键规则:
 *   - emotion === 'auto' 时, voice_setting 中**不写入** emotion 字段 (auto 是前端伪选项).
 *   - voice_setting / audio_setting: 用户未设置的子字段不写入对象.
 *   - voice_modify / pronunciation_dict: **按需传**, 全 default / 空 list 时整字段省略 (后端按 default 处理).
 *   - bitrate 仅在 format === 'mp3' 时写入 (其它格式上游不接).
 */

import {
  DEFAULT_MODEL,
  EMOTION_AUTO,
  VOICE_MODIFY_DEFAULT,
} from './voice-presets'
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'

export function buildMinimaxSpeechRequestBody({ mode, modeParams, collectedInputs, canvasId, nodeId }) {
  const body = {
    project_id: canvasId,
    node_id: nodeId,
  }
  // mode 仅在 builder 内部分支用 (这里两 mode 请求体结构相同; 上游 model 由 modeParams.model 决定).
  void mode

  // ─── model ───
  body.model = modeParams.model || DEFAULT_MODEL

  // ─── prompt: 端口 > 面板 ───
  // 面板 fallback 走 helper expand edge placeholder (view 升级到
  // TextInputWithEdges 后, placeholder 会出现在 modeParams.prompt 字符串里)
  const promptInput = collectedInputs.prompt
  const promptFromPort = Array.isArray(promptInput) ? promptInput[0] : promptInput
  body.prompt = promptFromPort?.content?.text
    || expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // ─── voice_setting (嵌套对象, 未设置的子字段不写入) ───
  // 注: pitch / vol 上游 spec 支持,但本期 UI 不开放,不写入这两个子字段(后端按 default 处理).
  const voiceSetting = {}
  if (modeParams.voice_id) voiceSetting.voice_id = modeParams.voice_id
  // emotion=auto 时, 不写入 emotion 字段
  if (modeParams.emotion && modeParams.emotion !== EMOTION_AUTO) {
    voiceSetting.emotion = modeParams.emotion
  }
  if (typeof modeParams.speed === 'number') voiceSetting.speed = modeParams.speed
  if (modeParams.english_normalization === true) voiceSetting.english_normalization = true
  if (Object.keys(voiceSetting).length > 0) body.voice_setting = voiceSetting

  // ─── audio_setting (嵌套对象, 未设置的子字段不写入) ───
  const audioSetting = {}
  const format = modeParams.format
  if (format) audioSetting.format = format
  if (typeof modeParams.sample_rate === 'number') audioSetting.sample_rate = modeParams.sample_rate
  // bitrate 仅 mp3 支持
  if (typeof modeParams.bitrate === 'number' && (!format || format === 'mp3')) {
    audioSetting.bitrate = modeParams.bitrate
  }
  if (typeof modeParams.channel === 'number') audioSetting.channel = modeParams.channel
  if (Object.keys(audioSetting).length > 0) body.audio_setting = audioSetting

  // ─── language_boost (顶层) ───
  if (modeParams.language_boost) body.language_boost = modeParams.language_boost

  // ─── voice_modify (按需传; 全 default 时不写入, 后端按 default 处理) ───
  const vm = modeParams.voice_modify || {}
  const vmPitch     = typeof vm.pitch === 'number'     ? vm.pitch     : VOICE_MODIFY_DEFAULT.pitch
  const vmIntensity = typeof vm.intensity === 'number' ? vm.intensity : VOICE_MODIFY_DEFAULT.intensity
  const vmTimbre    = typeof vm.timbre === 'number'    ? vm.timbre    : VOICE_MODIFY_DEFAULT.timbre
  const vmAllDefault =
    vmPitch === VOICE_MODIFY_DEFAULT.pitch
    && vmIntensity === VOICE_MODIFY_DEFAULT.intensity
    && vmTimbre === VOICE_MODIFY_DEFAULT.timbre
  if (!vmAllDefault) {
    body.voice_modify = { pitch: vmPitch, intensity: vmIntensity, timbre: vmTimbre }
  }

  // ─── pronunciation_dict (按需传; tone_list 为空时不写入) ───
  const pd = modeParams.pronunciation_dict || {}
  const toneList = Array.isArray(pd.tone_list) ? pd.tone_list.slice() : []
  if (toneList.length > 0) {
    body.pronunciation_dict = { tone_list: toneList }
  }

  return { body, urlFields: [] }
}
