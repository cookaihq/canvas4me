/**
 * 生成随机文件名，保留原扩展名。
 *
 * 用于上传到上游存储时不暴露用户本地的原始文件名（隐私 / 去重 / 避免奇怪字符）。
 * 节点上展示的文件名仍可继续用原名，这里只影响传给上游的字段。
 *
 * 示例：
 *   makeRandomFilename('vacation_photo.PNG') → 'lxk2pq3a4b5c6d7e.png'
 *   makeRandomFilename('untitled')          → 'lxk2pq3a4b5c6d7e'
 *   makeRandomFilename('')                  → 'lxk2pq3a4b5c6d7e'
 *
 * @param {string} originalName 原始文件名（含扩展名）
 * @returns {string}
 */
export function makeRandomFilename(originalName = '') {
  const dot = typeof originalName === 'string' ? originalName.lastIndexOf('.') : -1
  const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : ''
  const random = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return ext ? `${random}.${ext}` : random
}
