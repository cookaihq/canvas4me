/**
 * 把 chip 编辑器的 contentEditable DOM 子树序列化为 prompt 字符串。
 *
 * chipMode 控制 chip 如何序列化:
 *   'placeholder' (默认): chip → {{ai-canvas:edge:N}} 字面 — 用于回写 prompt state
 *   'expand': chip → 源节点 text 内容 — 用于写剪贴板 text/plain (外部 / 跨画布粘贴友好)
 *
 * 换行:
 *   <br>        → \n
 *   <div> / <p> → 段前补 \n 再递归 (回车在部分浏览器下会包块级元素)
 * caret-anchor 用的零宽空格(\u200B)序列化时过滤掉, 不污染 prompt 字符串。
 */
export function walkToText(rootChildNodes, chipMode = 'placeholder') {
  let text = ''
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      // 过滤 chip 周围的 caret-anchor ZWSP, 不污染 prompt 字符串
      text += (node.textContent || '').replace(/\u200B/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains('tp-chip') || node.classList?.contains('tp-chip-clipboard')) {
        if (chipMode === 'expand') {
          // 取 chip 内的源文本(.tp-chip-text 子元素) 或 marker 的 data-source-text
          const t = node.classList?.contains('tp-chip-clipboard')
            ? (node.getAttribute('data-source-text') || node.textContent || '')
            : (node.querySelector('.tp-chip-text')?.textContent || '')
          text += t
        } else {
          const sid = node.dataset?.sourceNodeId || node.getAttribute('data-source-node-id')
          text += `{{ai-canvas:edge:${sid}}}`
        }
      } else if (node.tagName === 'BR') {
        text += '\n'
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        // contenteditable 在某些浏览器下回车会包 <div>; 视为换行
        if (text && !text.endsWith('\n')) text += '\n'
        node.childNodes.forEach(walk)
      } else {
        node.childNodes.forEach(walk)
      }
    }
  }
  rootChildNodes.forEach(walk)
  return text
}

export function readPromptFromEditor(editor) {
  if (!editor) return ''
  return walkToText(Array.from(editor.childNodes), 'placeholder')
}
