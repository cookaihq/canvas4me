/** 是远端可下载 url（http/https），排除 data:/blob:/空。 */
function isRemoteUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) }

/**
 * 收集选中节点里"有远端文件产物"的项。选中 group → 展开其成员。文本/无 url 跳过。
 * @returns [{ id, url, name }]
 */
export function collectDownloadables(prevNodes, selectedIdSet, { isOutputNodeType }) {
  // 展开: 选中 group → 纳入其成员
  const ids = new Set(selectedIdSet)
  for (const n of prevNodes) {
    if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
  }
  const items = []
  for (const n of prevNodes) {
    if (!ids.has(n.id)) continue
    if (n.type === 'group') continue
    const url = n.data?.content?.url
    if (!isRemoteUrl(url)) continue
    items.push({ id: n.id, url, name: n.data?.name || n.data?.content?.fileName || n.type })
  }
  return items
}

/** 从 url 取扩展名（去 query），取不到回落 bin。 */
export function extFromUrl(url) {
  try {
    const path = new URL(url).pathname
    const m = /\.([a-z0-9]{1,8})$/i.exec(path)
    return m ? m[1].toLowerCase() : 'bin'
  } catch {
    const m = /\.([a-z0-9]{1,8})(?:\?|$)/i.exec(url || '')
    return m ? m[1].toLowerCase() : 'bin'
  }
}

function sanitize(name) {
  const s = String(name || '').replace(/[\/\\:*?"<>|]/g, '_').trim()
  return s || '未命名'
}

/** 生成 zip 内文件名：sanitize(name).ext，撞名加 -2/-3 直到唯一。 */
export function buildDownloadFileNames(items) {
  const used = new Set()
  return items.map(it => {
    const ext = extFromUrl(it.url)
    const stem = sanitize(it.name)
    let fileName = `${stem}.${ext}`
    let n = 1
    while (used.has(fileName)) { n += 1; fileName = `${stem}-${n}.${ext}` }
    used.add(fileName)
    return { url: it.url, fileName }
  })
}
