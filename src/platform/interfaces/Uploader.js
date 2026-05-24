/**
 * Uploader 接口 — 文件上传到对象存储
 *
 * 返回的 url 字段**必须是远端可访问的 http(s) URL**, 来源可以是:
 *   - 上游 API 临时 URL(72h auto_cleanup, URL 失效时由自愈层重新上传拿新 url)
 *   - 服务端中转后落地的对象存储 URL
 *
 * ⚠️ **禁止返回 `data:` (base64 data URL) 或 `blob:` (内存对象 URL)**:
 *  - base64 会被存进画布 JSON, 体积爆炸 + 关画布即失效
 *  - blob URL 仅在当前 tab 有效, 跨次打开 / 跨设备完全失效
 *  - 见 CLAUDE.md §Forbidden Actions「画布中只允许存储文件 URL」
 *
 * 实现侧约定: 当上传失败时, **应当抛错**让调用方走 catch 分支提示用户
 * (检查 API Key / 余额 / 网络等), 不要返回 base64 假装成功——画布拿到这种
 * "假 url"的下场是要么写进数据(违规), 要么调用方还得加 `data:` 前缀过滤
 * (重复防御性代码), 都不如直接抛错干净.
 *
 * @typedef {object} UploadResult
 * @property {string} url        — http(s) URL, 不接受 data:/blob: 前缀
 * @property {number} [size]
 * @property {string} [mimeType]
 * @property {string} [fileName]
 *
 * @typedef {object} Uploader
 * @property {(file: File, opts?: { onProgress?: (p: number) => void }) => Promise<UploadResult>} uploadFile
 * @property {(url: string) => Promise<void>}                                                     deleteFile
 */

export {}
