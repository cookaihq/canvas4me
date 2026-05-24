/**
 * 附件 count/size/MIME 纯校验器（无 React/无 @/）。
 * 类型兼容由模型门控（llmModelCatalog.getModelMissingCapabilities + picker）负责，本校验器不做 type 检查。
 * 入参：constraints（resolveModelConstraints 结果）、groups（4 类附件）。
 * 校验顺序（每项命中一条即止）：count → size → mime。缺 fileSize/mimeType 的项跳过 size/mime。
 */
const KINDS = ['image', 'video', 'audio', 'file']

export function validateAttachments({ constraints, groups }) {
  const cons = constraints || {}
  const g = groups || {}
  const invalid = []
  const perKindCount = {}

  for (const kind of KINDS) {
    const items = Array.isArray(g[kind]) ? g[kind] : []
    perKindCount[kind] = items.length
    const limit = cons[kind] || null
    if (!limit) continue
    items.forEach((item, idx) => {
      if (limit.maxCount != null && idx >= limit.maxCount) {
        invalid.push({ kind, item, reason: 'count_exceeded' }); return
      }
      if (limit.maxSizeMB != null && item.fileSize != null && item.fileSize > limit.maxSizeMB * 1024 * 1024) {
        invalid.push({ kind, item, reason: 'size_exceeded' }); return
      }
      if (Array.isArray(limit.mime) && limit.mime.length && item.mimeType && !limit.mime.includes(item.mimeType)) {
        invalid.push({ kind, item, reason: 'mime_unsupported' }); return
      }
    })
  }
  return { invalid, perKindCount, ok: invalid.length === 0 }
}
