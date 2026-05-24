import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useNodeSeqMap } from '../state/canvasDerived'
import { walkToText, readPromptFromEditor } from './walkEditorToText'

/**
 * TextInputWithEdges —— 文本端口「连入 + 手输」兼容输入框。
 *
 * 标准: docs/ui-standards/components-canvas.html #text-input-with-edges
 *
 * 数据形态: prompt 仍是 string,连入以 placeholder 内嵌:
 *   "请总结 {{ai-canvas:edge:node_3a2b}} 写 100 字"
 *
 * - contenteditable div, placeholder 渲染为不可编辑的 chip
 * - chip 内显示 head(#N) + 源节点完整 content.text + close(×)
 * - chip × 触发 onChipDelete(sourceNodeId) → 调用方负责删 edge
 * - placeholder 与 edges 的自动同步在 useEdgePlaceholderSync hook 里做
 * - 节点不存在的 placeholder → 直接渲染成字面字符串(不创建 chip)
 *
 * 选中/复制/粘贴:
 * - chip 通过 user-select: text + contenteditable=false 自动成为 atomic 单位
 * - copy/cut: 拦截事件,把 selection 范围内的 chip 序列化为 placeholder 字面写剪贴板
 * - paste: 拦截事件,在光标处插入纯文本(含 placeholder 字面);
 *         后续由 value useEffect 自动把 placeholder 渲染成 chip,
 *         由 useEdgePlaceholderSync 自动在画布上补 edge
 *
 * Props:
 *   value           — 当前 prompt string (含 placeholder)
 *   onChange(str)   — 编辑时回调,传新 prompt string
 *   placeholder     — 空状态提示文字
 *   nodes           — React Flow 当前所有 nodes (用于查源节点的 canvasSeq + content.text)
 *   onChipDelete(sourceNodeId)  — chip × 点击时回调
 *   disabled        — 只读
 *   variant         — 'inline' (默认 96h) / 'modal' (240h, 大编辑器)
 */

const PLACEHOLDER_RE = /\{\{ai-canvas:edge:([^}]+)\}\}/g

function parsePromptSegments(prompt) {
  if (!prompt) return []
  const segments = []
  let cursor = 0
  prompt.replace(PLACEHOLDER_RE, (match, sourceId, offset) => {
    if (offset > cursor) {
      segments.push({ type: 'text', text: prompt.slice(cursor, offset) })
    }
    segments.push({ type: 'edge', sourceNodeId: sourceId })
    cursor = offset + match.length
    return match
  })
  if (cursor < prompt.length) {
    segments.push({ type: 'text', text: prompt.slice(cursor) })
  }
  return segments
}

function createEdgeChip(sourceNodeId, sourceNode, seqMap) {
  const chip = document.createElement('span')
  chip.className = 'tp-chip'
  chip.contentEditable = 'false'
  chip.dataset.sourceNodeId = sourceNodeId

  const seq = seqMap?.get(sourceNodeId)
  const seqLabel = typeof seq === 'number' ? `#${seq}` : '#?'
  const text = sourceNode?.data?.content?.text || ''
  // 含 \n 的多段文字 → 切到 block 形态(独占行 + 引用块视觉)
  if (text.includes('\n')) chip.classList.add('tp-chip-block')

  // head: 🔗 #N
  const head = document.createElement('span')
  head.className = 'tp-chip-head'
  head.innerHTML =
    '<svg class="tp-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/>' +
    '</svg>'
  head.appendChild(document.createTextNode(seqLabel))
  chip.appendChild(head)

  // text
  const textEl = document.createElement('span')
  textEl.className = 'tp-chip-text'
  textEl.textContent = text || '(空)'
  chip.appendChild(textEl)

  // close: ×
  const close = document.createElement('span')
  close.className = 'tp-chip-close'
  close.setAttribute('title', '移除引用 (会同时删掉这根连线)')
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M6 6l12 12M6 18L18 6"/></svg>'
  chip.appendChild(close)

  return chip
}

// chip 是 contenteditable=false 的 atomic 元素, 浏览器不能把 caret 放在 chip 内部,
// 如果 chip 前/后没有相邻 text node, 用户按 ←/→ / 鼠标点击 chip 前/后空白处都无法定位光标。
// 解决: 每个 chip 前后插入一个零宽空格(​)作为 caret anchor。
// 序列化(walkToText)时把 ​ 过滤掉, 不污染 prompt 字符串。
const ZWSP = '​'

function renderSegmentsToEditor(editor, segments, nodes, seqMap) {
  editor.innerHTML = ''
  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  // editor 开头始终加一个 ZWSP, 让光标能停在第一个 chip 之前
  editor.appendChild(document.createTextNode(ZWSP))
  for (const seg of segments) {
    if (seg.type === 'text') {
      // 把 \n 转成 <br> + 文本节点的混合, contenteditable 才能正确显示换行
      const parts = (seg.text || '').split('\n')
      parts.forEach((part, i) => {
        if (i > 0) editor.appendChild(document.createElement('br'))
        if (part) editor.appendChild(document.createTextNode(part))
      })
    } else if (seg.type === 'edge') {
      const sourceNode = nodesById.get(seg.sourceNodeId)
      if (!sourceNode) {
        // 节点不存在 → 字面字符串显示, 不创建 chip
        // 用户后续编辑或 useEdgePlaceholderSync 会处理
        editor.appendChild(document.createTextNode(`{{ai-canvas:edge:${seg.sourceNodeId}}}`))
      } else {
        editor.appendChild(createEdgeChip(seg.sourceNodeId, sourceNode, seqMap))
        // chip 后插入 ZWSP, 让光标能停在 chip 之后(尤其连续两个 chip 之间)
        editor.appendChild(document.createTextNode(ZWSP))
      }
    }
  }
}

// 不重建 DOM,只刷新现有 chip 的 #N / 内文字 / block 切换
// 源节点已被删除 → 把 chip 替换为字面 text node (避免出现孤儿 chip)
function refreshChipsInPlace(editor, nodes, seqMap) {
  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  for (const chip of Array.from(editor.querySelectorAll('.tp-chip'))) {
    const sid = chip.dataset.sourceNodeId
    const sourceNode = nodesById.get(sid)

    if (!sourceNode) {
      // 源节点不存在 → 替换为字面字符串 text node
      chip.replaceWith(document.createTextNode(`{{ai-canvas:edge:${sid}}}`))
      continue
    }

    // head 内的 #N (svg + text node)
    const head = chip.querySelector('.tp-chip-head')
    if (head) {
      const seq = seqMap?.get(sid)
      const seqLabel = typeof seq === 'number' ? `#${seq}` : '#?'
      const lastTextNode = Array.from(head.childNodes).reverse().find(n => n.nodeType === Node.TEXT_NODE)
      if (lastTextNode && lastTextNode.textContent !== seqLabel) lastTextNode.textContent = seqLabel
    }

    // 内文字
    const textEl = chip.querySelector('.tp-chip-text')
    const newText = sourceNode?.data?.content?.text || '(空)'
    if (textEl && textEl.textContent !== newText) textEl.textContent = newText

    // 源节点 text 变多段(含 \n)或反过来 → 同步切换 block / inline 形态
    chip.classList.toggle('tp-chip-block', newText.includes('\n'))
  }
}

// DOM 是否真正反映 value:不仅字符串等价, 还要 chip 形态匹配
// (避免 paste 后字面 placeholder 文本不被解析为 chip 的 bug)
function isDomMatchingValue(editor, value, nodes) {
  if (readPromptFromEditor(editor) !== value) return false

  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  // 提取 value 中所有 placeholder 的 sid (按出现顺序)
  const placeholderSids = []
  value.replace(/\{\{ai-canvas:edge:([^}]+)\}\}/g, (_m, sid) => {
    placeholderSids.push(sid)
    return _m
  })
  // 应该有 chip 的 sid (节点在画布存在的, 按出现顺序)
  const expectedChipSids = placeholderSids.filter(sid => nodesById.has(sid))
  // DOM 里实际的 chip sid (按出现顺序)
  const domChipSids = Array.from(editor.querySelectorAll('.tp-chip'))
    .map(c => c.dataset.sourceNodeId)

  if (expectedChipSids.length !== domChipSids.length) return false
  for (let i = 0; i < expectedChipSids.length; i++) {
    if (expectedChipSids[i] !== domChipSids[i]) return false
  }
  return true
}

// 写剪贴板 text/plain:chip 全部展开成源文本(跨画布 / 外部应用友好)
function serializeRangeToPlain(range) {
  const frag = range.cloneContents()
  return walkToText(Array.from(frag.childNodes), 'expand')
}

// 写剪贴板 text/html:chip 包成 .tp-chip-clipboard marker, 携带 sid + source text
// 同画布粘贴时 handlePaste 解析这个 marker 重建 chip (节点存在则 placeholder, 不存在则展开)
function serializeRangeToHtml(range) {
  const frag = range.cloneContents()
  const wrapper = document.createElement('div')
  wrapper.appendChild(frag)
  for (const chip of Array.from(wrapper.querySelectorAll('.tp-chip'))) {
    const sid = chip.dataset.sourceNodeId
    const sourceText = chip.querySelector('.tp-chip-text')?.textContent || ''
    const marker = document.createElement('span')
    marker.className = 'tp-chip-clipboard'
    marker.setAttribute('data-source-node-id', sid)
    marker.setAttribute('data-source-text', sourceText)
    marker.textContent = sourceText
    chip.replaceWith(marker)
  }
  return wrapper.innerHTML
}

// 解析 paste 来的 html: 用 nodesById 判断 chip 节点是否存在画布,
// 存在 → 用 placeholder, 不存在 → 展开为源文本
function parsePastedHtmlToPrompt(htmlString, nodesById) {
  const tmp = document.createElement('div')
  tmp.innerHTML = htmlString
  let text = ''
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains('tp-chip-clipboard') || node.classList?.contains('tp-chip')) {
        const sid = node.getAttribute('data-source-node-id') || node.dataset?.sourceNodeId
        const srcText = node.getAttribute('data-source-text')
          || node.querySelector('.tp-chip-text')?.textContent
          || node.textContent
          || ''
        if (sid && nodesById.has(sid)) {
          text += `{{ai-canvas:edge:${sid}}}`
        } else {
          text += srcText
        }
      } else if (node.tagName === 'BR') {
        text += '\n'
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (text && !text.endsWith('\n')) text += '\n'
        node.childNodes.forEach(walk)
      } else {
        node.childNodes.forEach(walk)
      }
    }
  }
  tmp.childNodes.forEach(walk)
  return text
}

// 在当前光标位置插入纯文本(\n 转成 <br>)
function insertTextAtCursor(text) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const frag = document.createDocumentFragment()
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'))
    if (line) frag.appendChild(document.createTextNode(line))
  })
  const lastNode = frag.lastChild
  range.insertNode(frag)
  if (lastNode) {
    range.setStartAfter(lastNode)
    range.setEndAfter(lastNode)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

const TextInputWithEdges = forwardRef(function TextInputWithEdges(
  { value, onChange, placeholder, nodes, onChipDelete, disabled, variant = 'inline' },
  ref,
) {
  const editorRef = useRef(null)
  const composingRef = useRef(false) // IME 输入法 composition 期间不回写
  const lastWroteRef = useRef('')    // 上次外部 value 同步进 DOM 的字符串,防止覆盖光标

  // 节点序号是派生属性(不在 node.data 上),chip 的 #N 从派生序号表取
  const seqMap = useNodeSeqMap()

  // value / nodes / 序号 变化 → 渲染到 DOM
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const safeValue = typeof value === 'string' ? value : ''
    // guard:DOM 是否真正反映 value(字符串等价 + chip 形态匹配)
    //   - 字符串不等价 → 重建
    //   - 字符串等价但 DOM 里有"应该是 chip 但还是字面 text"(粘贴 / 节点恢复)
    //     或"应该是字面 text 但还是 chip"(节点被删) → 重建
    if (isDomMatchingValue(ed, safeValue, nodes)) {
      refreshChipsInPlace(ed, nodes, seqMap)
      return
    }
    lastWroteRef.current = safeValue
    const segments = parsePromptSegments(safeValue)
    renderSegmentsToEditor(ed, segments, nodes || [], seqMap)
  }, [value, nodes, seqMap])

  // chip × 点击事件 (event delegation, 避免每个 chip 单独绑回调闭包问题)
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const handler = e => {
      const closeBtn = e.target.closest?.('.tp-chip-close')
      if (!closeBtn) return
      const chip = closeBtn.closest('.tp-chip')
      const sid = chip?.dataset?.sourceNodeId
      e.preventDefault()
      e.stopPropagation()
      if (sid) onChipDelete?.(sid)
    }
    ed.addEventListener('click', handler)
    return () => ed.removeEventListener('click', handler)
  }, [onChipDelete])

  const handleInput = () => {
    if (composingRef.current) return
    const ed = editorRef.current
    if (!ed) return
    const next = readPromptFromEditor(ed)
    lastWroteRef.current = next // 标记当前 DOM 内容 = next, 避免外部 onChange 回流触发重渲染
    onChange?.(next)
  }

  // copy / cut: 写双格式剪贴板
  //   text/plain: chip 展开为源文本(外部 / 跨画布粘贴友好)
  //   text/html:  chip 包成 .tp-chip-clipboard marker(同画布粘贴时识别+按节点匹配重建)
  const handleCopy = e => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return
    if (range.collapsed) return
    e.preventDefault()
    e.stopPropagation()
    const plain = serializeRangeToPlain(range)
    const html = serializeRangeToHtml(range)
    e.clipboardData.setData('text/plain', plain)
    e.clipboardData.setData('text/html', html)
  }

  const handleCut = e => {
    handleCopy(e)
    if (e.defaultPrevented) {
      const sel = window.getSelection()
      const range = sel?.getRangeAt(0)
      range?.deleteContents()
      handleInput()
    }
  }

  // paste: 优先解析 text/html(同画布复制的带 chip 元数据),
  //   chip 节点在当前画布存在 → 用 placeholder 字面(useEffect 会渲染为 chip,
  //                                              useEdgePlaceholderSync 会补 edge)
  //   chip 节点不存在(跨画布粘贴) → 用 data-source-text 展开为源文本
  // 没 html / 没 chip marker → 直接用 text/plain 当普通文字插入
  const handlePaste = e => {
    if (!editorRef.current) return
    const dt = e.clipboardData
    if (!dt) return
    e.preventDefault()
    e.stopPropagation()

    const html = dt.getData('text/html')
    let pasted = ''
    if (html && /tp-chip(?:-clipboard)?/.test(html)) {
      const nodesById = new Map((nodes || []).map(n => [n.id, n]))
      pasted = parsePastedHtmlToPrompt(html, nodesById)
    } else {
      pasted = dt.getData('text/plain') || ''
    }
    if (!pasted) return

    insertTextAtCursor(pasted)
    handleInput()
  }

  // 选中态: chip 出现在 selection 范围内 → add .tp-chip-selected
  // 让用户看清"chip 作为整体被包含在选区里"
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const onSelChange = () => {
      const sel = window.getSelection()
      const reset = () => {
        for (const c of ed.querySelectorAll('.tp-chip.tp-chip-selected')) {
          c.classList.remove('tp-chip-selected')
        }
      }
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return reset()
      const range = sel.getRangeAt(0)
      if (!ed.contains(range.commonAncestorContainer)) return reset()
      for (const chip of ed.querySelectorAll('.tp-chip')) {
        const inSel = sel.containsNode(chip, true)
        chip.classList.toggle('tp-chip-selected', inSel)
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    // 在当前光标处插入纯文本(如参考图 token 插入); 编辑器没 focus 时追加到末尾
    insertText: (text) => {
      const ed = editorRef.current
      if (!ed) return
      ed.focus()
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !ed.contains(sel.anchorNode)) {
        // 光标不在编辑器内 → 移到末尾
        const range = document.createRange()
        range.selectNodeContents(ed)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
      insertTextAtCursor(text)
      handleInput()
    },
  }))

  const isEmpty = !value
  const heightClass = variant === 'modal' ? 'tp-editor-modal' : 'tp-editor-inline'

  return (
    <div
      ref={editorRef}
      className={`tp-editor ${heightClass}`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-empty={isEmpty || undefined}
      data-placeholder={placeholder}
      onInput={handleInput}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
      onCompositionStart={() => { composingRef.current = true }}
      onCompositionEnd={() => {
        composingRef.current = false
        handleInput()
      }}
      spellCheck={false}
    />
  )
})

export default TextInputWithEdges
export { PLACEHOLDER_RE }
