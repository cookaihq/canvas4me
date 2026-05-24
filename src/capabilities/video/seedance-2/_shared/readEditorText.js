/**
 * 把 chip 编辑器的 contentEditable DOM 子树序列化为 prompt 字符串。
 *
 * chip 序列化:
 *   - 资源 chip (.sd2-chip, data-anchor="image-1") → @Image1 / @Video2 / @Audio3
 *   - 文本端口 chip (.tp-chip)                      → {{ai-canvas:edge:<sid>}} 字面
 * 换行:
 *   - <br>            → \n
 *   - <div> / <p>     → 段前补 \n 再递归 (回车在部分浏览器下会包块级元素)
 * nbsp(\u00A0) 归一为普通空格。
 */
export function readTextFromEditor(editor) {
  if (!editor) return ''
  let text = ''
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const anchor = node.dataset?.anchor
    if (anchor) {
      // 资源 chip — 用上游英文写法序列化 (与 buildSeedancePromptText 保持一致)
      const [type, idx] = anchor.split('-')
      if (type === 'image') text += `@Image${idx}`
      else if (type === 'video') text += `@Video${idx}`
      else if (type === 'audio') text += `@Audio${idx}`
      else text += anchor
      return
    }
    if (node.classList?.contains('tp-chip')) {
      // 文本端口连入 chip → placeholder 字面 (跟其它能力一致)
      text += `{{ai-canvas:edge:${node.dataset.sourceNodeId}}}`
      return
    }
    if (node.tagName === 'BR') {
      text += '\n'
      return
    }
    if (node.tagName === 'DIV' || node.tagName === 'P') {
      // contentEditable 回车在部分浏览器下会包 <div>/<p>; 视为换行后递归子节点
      // (否则块内换行与 chip 都会被 textContent 拍平, 存盘丢换行)
      if (text && !text.endsWith('\n')) text += '\n'
      node.childNodes.forEach(walk)
      return
    }
    // 其它包裹元素 (如 span) → 递归, 不直接取 textContent (避免吞掉内部 chip)
    node.childNodes.forEach(walk)
  }
  editor.childNodes.forEach(walk)
  return text.replace(/\u00A0/g, ' ')
}
