// src/capabilities/llm/llm/_shared/buildCustomMessages.js
/**
 * 混合模式 messages 组装（纯逻辑，无 @/ alias）。
 *
 * 规则：
 *   - systemPrompt 非空 → messages[0] = { role:'system', content: <string> }
 *   - 单条 user 消息：
 *       无附件 → content = promptText 字符串
 *       有附件 → content = 块数组，顺序 图片→视频→音频→文件→文本(prompt 放最后，空则不加)
 */
export function assembleMessages({ systemPrompt, promptText, images, videos, audios, files }) {
  const messages = []
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  const blocks = []
  for (const url of images || []) blocks.push({ type: 'image_url', image_url: { url } })
  for (const url of videos || []) blocks.push({ type: 'video_url', video_url: { url } })
  for (const url of audios || []) blocks.push({ type: 'audio_url', audio_url: { url } })
  for (const url of files  || []) blocks.push({ type: 'file_url',  file_url:  { url } })

  let content
  if (blocks.length === 0) {
    content = promptText || ''
  } else {
    if (promptText && promptText.trim()) blocks.push({ type: 'text', text: promptText })
    content = blocks
  }

  messages.push({ role: 'user', content })
  return messages
}
