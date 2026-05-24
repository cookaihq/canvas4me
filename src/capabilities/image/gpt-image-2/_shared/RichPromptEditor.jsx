import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useNodeSeqMap } from '@/canvas/state/canvasDerived'
import { Pencil, Eraser } from '@/canvas/icons'
import './rich-prompt-editor.css'

/**
 * 富文本提示词编辑器（gpt-image-2 专用）
 *
 * 数据流：
 * - prompt 是纯文本字符串,可能含两种 placeholder:
 *     @图像N / @imageN              → 参考图引用,渲染为带缩略图的 chip token
 *     {{ai-canvas:edge:<sid>}}      → 文本端口连入,渲染为 .tp-chip
 *   (后者跟 TextInputWithEdges 共用 .tp-chip CSS,见 ui-standards #text-input-with-edges)
 * - 编辑器内部 contenteditable, 两种 chip 都是 atomic 单位
 * - 用户编辑后,从 DOM 提取文本回写到 prompt
 * - 提交时 prompt 进 builder, builder 调 expandPromptPlaceholders 把 edge
 *   placeholder 替换成源节点 text
 */

const IMAGE_REF_PATTERN = /@(?:图像|[Ii]mage)(\d+)/g
const EDGE_PLACEHOLDER_RE = /\{\{ai-canvas:edge:([^}]+)\}\}/g
const ZWSP = '​'  // 零宽空格,chip 周围 caret anchor (同 TextInputWithEdges)

function parsePromptSegments(prompt) {
  if (!prompt) return []
  // 同时匹配 @图像N 和 {{ai-canvas:edge:N}},按 offset 顺序合并
  const matches = []
  prompt.replace(IMAGE_REF_PATTERN, (match, indexStr, offset) => {
    matches.push({ type: 'image', index: parseInt(indexStr, 10), offset, len: match.length })
    return match
  })
  prompt.replace(EDGE_PLACEHOLDER_RE, (match, sid, offset) => {
    matches.push({ type: 'edge', sourceNodeId: sid, offset, len: match.length })
    return match
  })
  matches.sort((a, b) => a.offset - b.offset)

  const segments = []
  let cursor = 0
  for (const m of matches) {
    if (m.offset > cursor) {
      segments.push({ type: 'text', text: prompt.slice(cursor, m.offset) })
    }
    segments.push(m)
    cursor = m.offset + m.len
  }
  if (cursor < prompt.length) {
    segments.push({ type: 'text', text: prompt.slice(cursor) })
  }
  return segments
}

// 与 TextInputWithEdges 共用 .tp-chip CSS (定义在 src/canvas/styles.css)
function createEdgeChip(sourceNodeId, sourceNode, seqMap) {
  const chip = document.createElement('span')
  chip.className = 'tp-chip'
  chip.contentEditable = 'false'
  chip.dataset.sourceNodeId = sourceNodeId
  const seq = seqMap?.get(sourceNodeId)
  const seqLabel = typeof seq === 'number' ? `#${seq}` : '#?'
  const text = sourceNode?.data?.content?.text || ''
  if (text.includes('\n')) chip.classList.add('tp-chip-block')

  const head = document.createElement('span')
  head.className = 'tp-chip-head'
  head.innerHTML =
    '<svg class="tp-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/>' +
    '</svg>'
  head.appendChild(document.createTextNode(seqLabel))
  chip.appendChild(head)

  const textEl = document.createElement('span')
  textEl.className = 'tp-chip-text'
  textEl.textContent = text || '(空)'
  chip.appendChild(textEl)

  const close = document.createElement('span')
  close.className = 'tp-chip-close'
  close.setAttribute('title', '移除引用 (会同时删掉这根连线)')
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M6 6l12 12M6 18L18 6"/></svg>'
  chip.appendChild(close)
  return chip
}

function createImageToken(index, thumbUrl) {
  const token = document.createElement('span')
  token.className = 'gi2-prompt-token'
  token.contentEditable = 'false'
  token.dataset.index = String(index)

  if (thumbUrl) {
    const thumb = document.createElement('img')
    thumb.className = 'gi2-prompt-token-thumb'
    thumb.src = thumbUrl
    thumb.draggable = false
    thumb.onerror = () => { thumb.style.display = 'none' }
    token.appendChild(thumb)
  } else {
    const placeholder = document.createElement('span')
    placeholder.className = 'gi2-prompt-token-placeholder'
    placeholder.textContent = '?'
    token.appendChild(placeholder)
  }

  token.appendChild(document.createTextNode(`@图像${index}`))
  return token
}

function readPromptFromEditor(editor) {
  if (!editor) return ''
  let text = ''

  editor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 图像 token (data-index)
      const index = node.dataset?.index
      if (index) {
        text += `@图像${index}`
        return
      }
      // edge chip (.tp-chip + data-source-node-id)
      if (node.classList?.contains('tp-chip')) {
        text += `{{ai-canvas:edge:${node.dataset.sourceNodeId}}}`
        return
      }
      if (node.tagName === 'BR') {
        text += '\n'
      } else {
        text += node.textContent || ''
      }
    }
  })

  // nbsp → 普通空格, 过滤 chip caret-anchor ZWSP, 不污染 prompt 字符串
  return text.replace(/ /g, ' ').replace(/​/g, '')
}

// 判断 DOM 是否真正反映 prompt:字符串等价 + edge chip 形态匹配
// (避免 paste edge placeholder 字面文本时 useEffect 跳过重建的 bug,
//  同 TextInputWithEdges 的 isDomMatchingValue)
function isDomMatchingPrompt(editor, prompt, nodes) {
  if (readPromptFromEditor(editor) !== prompt) return false
  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  const placeholderSids = []
  prompt.replace(EDGE_PLACEHOLDER_RE, (_m, sid) => {
    placeholderSids.push(sid)
    return _m
  })
  const expected = placeholderSids.filter(sid => nodesById.has(sid))
  const domChipSids = Array.from(editor.querySelectorAll('.tp-chip'))
    .map(c => c.dataset.sourceNodeId)
  if (expected.length !== domChipSids.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== domChipSids[i]) return false
  }
  return true
}

// 序列化 selection range 为剪贴板用的两种格式 (跟 TextInputWithEdges 一致)
function rangeToPlain(range) {
  const frag = range.cloneContents()
  return walkRangeToText(Array.from(frag.childNodes), 'expand')
}
function rangeToHtml(range) {
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
function walkRangeToText(rootChildNodes, chipMode) {
  let text = ''
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent || '').replace(/​/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const imgIdx = node.dataset?.index
      if (imgIdx) {
        text += `@图像${imgIdx}`
        return
      }
      if (node.classList?.contains('tp-chip') || node.classList?.contains('tp-chip-clipboard')) {
        if (chipMode === 'expand') {
          const t = node.classList?.contains('tp-chip-clipboard')
            ? (node.getAttribute('data-source-text') || node.textContent || '')
            : (node.querySelector('.tp-chip-text')?.textContent || '')
          text += t
        } else {
          const sid = node.dataset?.sourceNodeId || node.getAttribute('data-source-node-id')
          text += `{{ai-canvas:edge:${sid}}}`
        }
        return
      }
      if (node.tagName === 'BR') text += '\n'
      else node.childNodes.forEach(walk)
    }
  }
  rootChildNodes.forEach(walk)
  return text
}
function parsePastedHtmlToPrompt(html, nodesById) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  let text = ''
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent || '').replace(/​/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains('tp-chip-clipboard') || node.classList?.contains('tp-chip')) {
        const sid = node.getAttribute('data-source-node-id') || node.dataset?.sourceNodeId
        const srcText = node.getAttribute('data-source-text')
          || node.querySelector?.('.tp-chip-text')?.textContent
          || node.textContent
          || ''
        if (sid && nodesById.has(sid)) {
          text += `{{ai-canvas:edge:${sid}}}`
        } else {
          text += srcText
        }
        return
      }
      if (node.tagName === 'BR') text += '\n'
      else node.childNodes.forEach(walk)
    }
  }
  tmp.childNodes.forEach(walk)
  return text
}

function renderSegmentsToEditor(editor, segments, referenceImages, nodes, seqMap) {
  if (!editor) return
  editor.innerHTML = ''
  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  // editor 开头 ZWSP, 让 caret 能停在第一个 chip 之前 (同 TextInputWithEdges)
  editor.appendChild(document.createTextNode(ZWSP))

  segments.forEach((segment) => {
    if (segment.type === 'image') {
      const item = referenceImages[segment.index - 1]
      const thumbUrl = item?.url || ''
      editor.appendChild(createImageToken(segment.index, thumbUrl))
    } else if (segment.type === 'edge') {
      const sourceNode = nodesById.get(segment.sourceNodeId)
      if (!sourceNode) {
        // 节点不存在 (跨画布粘贴 / 节点已删) → 字面字符串保留
        editor.appendChild(document.createTextNode(`{{ai-canvas:edge:${segment.sourceNodeId}}}`))
      } else {
        editor.appendChild(createEdgeChip(segment.sourceNodeId, sourceNode, seqMap))
        // chip 后 ZWSP 作 caret anchor
        editor.appendChild(document.createTextNode(ZWSP))
      }
    } else if (segment.type === 'text') {
      editor.appendChild(document.createTextNode(segment.text))
    }
  })
}

const RichPromptEditor = forwardRef(function RichPromptEditor({
  prompt,
  onPromptChange,
  referenceImages = [],
  nodes = [],
  onChipDelete,
  onKeyDown,
  disabled = false,
  placeholder = '描述想要生成的图像，可输入 @图像N 内联引用参考图...',
}, ref) {
  const editorRef = useRef(null)
  const isComposingRef = useRef(false)
  const lastPromptRef = useRef(prompt)

  // 节点序号是派生属性(不在 node.data 上),chip 的 #N 从派生序号表取
  const seqMap = useNodeSeqMap()

  useEffect(() => {
    if (!editorRef.current) return
    // guard: DOM 真正反映 prompt 时不重建 (保护光标 + composition)
    // 包括 chip 形态匹配 (避免粘贴含 placeholder 时字面文本不被解析为 chip)
    if (isDomMatchingPrompt(editorRef.current, prompt, nodes)) return

    lastPromptRef.current = prompt
    const segments = parsePromptSegments(prompt)
    renderSegmentsToEditor(editorRef.current, segments, referenceImages, nodes, seqMap)
  }, [prompt, referenceImages, nodes, seqMap])

  useEffect(() => {
    if (!editorRef.current) return
    const tokens = editorRef.current.querySelectorAll('.gi2-prompt-token')
    tokens.forEach((token) => {
      const index = parseInt(token.dataset.index, 10)
      const item = referenceImages[index - 1]
      const thumbUrl = item?.url || ''
      const existingThumb = token.querySelector('.gi2-prompt-token-thumb')

      if (thumbUrl && existingThumb) {
        existingThumb.src = thumbUrl
      } else if (thumbUrl && !existingThumb) {
        const thumb = document.createElement('img')
        thumb.className = 'gi2-prompt-token-thumb'
        thumb.src = thumbUrl
        thumb.draggable = false
        thumb.onerror = () => { thumb.style.display = 'none' }
        token.insertBefore(thumb, token.firstChild)
      } else if (!thumbUrl && existingThumb) {
        existingThumb.remove()
      }
    })
  }, [referenceImages])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const editor = editorRef.current
    if (!editor) return

    const text = readPromptFromEditor(editor)
    lastPromptRef.current = text

    // 检测新增的 @图像N 字面文本 → 立即重渲染为图像 token (含 cursor restore)
    IMAGE_REF_PATTERN.lastIndex = 0
    const hasNewImageToken = IMAGE_REF_PATTERN.test(text)
    if (hasNewImageToken) {
      const sel = window.getSelection()
      const range = sel?.rangeCount > 0 ? sel.getRangeAt(0) : null
      const cursorOffset = range ? getTextOffset(editor, range.startContainer, range.startOffset) : text.length

      const segments = parsePromptSegments(text)
      renderSegmentsToEditor(editor, segments, referenceImages, nodes, seqMap)

      restoreCursor(editor, cursorOffset)
    }
    // edge placeholder 字面 → 不在 handleInput 里立即重渲染,
    // 依赖 useEffect 的 isDomMatchingPrompt guard 触发重建 (避免复杂 cursor 计算)

    onPromptChange(text)
  }, [onPromptChange, referenceImages, nodes, seqMap])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    handleInput()
  }, [handleInput])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const range = sel.getRangeAt(0)
      if (!range.collapsed) return

      const node = e.key === 'Backspace'
        ? getPreviousSibling(range.startContainer, range.startOffset)
        : getNextSibling(range.startContainer, range.startOffset)

      // 图像 token (atomic 删除)
      if (node?.classList?.contains('gi2-prompt-token')) {
        e.preventDefault()
        node.remove()
        const text = readPromptFromEditor(editorRef.current)
        lastPromptRef.current = text
        onPromptChange(text)
        return
      }
      // edge chip (atomic 删除 + 同步删 edge)
      if (node?.classList?.contains('tp-chip')) {
        e.preventDefault()
        const sid = node.dataset.sourceNodeId
        node.remove()
        const text = readPromptFromEditor(editorRef.current)
        lastPromptRef.current = text
        onPromptChange(text)
        if (sid) onChipDelete?.(sid)
        return
      }
    }

    onKeyDown?.(e)
  }, [onKeyDown, onPromptChange, onChipDelete])

  // copy/cut/paste: 同 TextInputWithEdges 模式 — 双格式剪贴板
  // text/plain: chip 展开成源 text (跨画布 / 外部友好)
  // text/html:  chip 包成 .tp-chip-clipboard marker (同画布粘贴时按节点匹配重建)
  const handleCopy = useCallback((e) => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return
    if (range.collapsed) return
    e.preventDefault()
    e.stopPropagation()
    e.clipboardData.setData('text/plain', rangeToPlain(range))
    e.clipboardData.setData('text/html', rangeToHtml(range))
  }, [])

  const handleCut = useCallback((e) => {
    handleCopy(e)
    if (e.defaultPrevented) {
      const sel = window.getSelection()
      const range = sel?.getRangeAt(0)
      range?.deleteContents()
      // 触发 input 更新 prompt
      const editor = editorRef.current
      if (editor) {
        const text = readPromptFromEditor(editor)
        lastPromptRef.current = text
        onPromptChange(text)
      }
    }
  }, [handleCopy, onPromptChange])

  const handlePaste = useCallback((e) => {
    if (!editorRef.current) return
    const dt = e.clipboardData
    if (!dt) return
    e.preventDefault()
    e.stopPropagation()

    const html = dt.getData('text/html')
    const plain = dt.getData('text/plain') || ''
    let pasted = ''
    if (html && /tp-chip(?:-clipboard)?/.test(html)) {
      const nodesById = new Map((nodes || []).map(n => [n.id, n]))
      pasted = parsePastedHtmlToPrompt(html, nodesById)
    } else if (/\{\{ai-canvas:edge:/.test(plain)) {
      // 兜底: plain 里含 placeholder 字面 → 当 placeholder 处理
      // (覆盖 chrome strip text/html 的边缘场景)
      pasted = plain
    } else {
      pasted = plain
    }
    if (!pasted) return
    document.execCommand('insertText', false, pasted)
  }, [nodes])

  // chip × 点击事件 (event delegation)
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const handler = (e) => {
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

  // selectionchange: selection 覆盖 chip 时给 chip 加 .tp-chip-selected
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
        chip.classList.toggle('tp-chip-selected', sel.containsNode(chip, true))
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  const handleClear = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
    lastPromptRef.current = ''
    onPromptChange('')
  }, [onPromptChange])

  const insertToken = useCallback((imageIndex) => {
    const editor = editorRef.current
    if (!editor) return

    const item = referenceImages[imageIndex - 1]
    const thumbUrl = item?.url || ''
    const token = createImageToken(imageIndex, thumbUrl)

    const sel = window.getSelection()
    if (sel?.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(token)
      range.setStartAfter(token)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editor.appendChild(token)
    }

    const text = readPromptFromEditor(editor)
    lastPromptRef.current = text
    onPromptChange(text)
  }, [referenceImages, onPromptChange])

  useImperativeHandle(ref, () => ({ insertToken }), [insertToken])

  const isEmpty = !prompt?.trim()

  return (
    <div className="gi2-prompt-section">
      <div className="gi2-prompt-header">
        <span className="gi2-prompt-title">
          <Pencil size={13} style={{ marginRight: 6 }} />
          Prompt
        </span>
        {!isEmpty && !disabled && (
          <button type="button" className="gi2-prompt-clear" onClick={handleClear}>
            <Eraser size={13} style={{ marginRight: 4 }} />
            清空
          </button>
        )}
      </div>
      <div className={`gi2-prompt-box${disabled ? ' disabled' : ''}`}>
        <div
          ref={editorRef}
          className="gi2-prompt-editor"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          role="textbox"
          aria-multiline="true"
        />
        {isEmpty && (
          <div className="gi2-prompt-placeholder">{placeholder}</div>
        )}
      </div>
    </div>
  )
})

export default RichPromptEditor

// ─── helpers ───

function getTextOffset(root, targetNode, targetOffset) {
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  let node = walker.nextNode()

  while (node) {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        return offset + targetOffset
      }
      return offset
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0
    } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.index) {
      const tokenText = `@图像${node.dataset.index}`
      offset += tokenText.length
      let next = walker.nextNode()
      while (next && node.contains(next)) {
        next = walker.nextNode()
      }
      node = next
      continue
    }

    node = walker.nextNode()
  }

  return offset
}

function restoreCursor(root, targetOffset) {
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  let node = walker.nextNode()

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length || 0
      if (offset + len >= targetOffset) {
        const sel = window.getSelection()
        const range = document.createRange()
        range.setStart(node, targetOffset - offset)
        range.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(range)
        return
      }
      offset += len
    } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.index) {
      const tokenText = `@图像${node.dataset.index}`
      const tokenLen = tokenText.length
      if (offset + tokenLen >= targetOffset) {
        const sel = window.getSelection()
        const range = document.createRange()
        range.setStartAfter(node)
        range.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(range)
        return
      }
      offset += tokenLen
      let next = walker.nextNode()
      while (next && node.contains(next)) {
        next = walker.nextNode()
      }
      node = next
      continue
    }

    node = walker.nextNode()
  }

  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function getPreviousSibling(node, offset) {
  if (node.nodeType === Node.TEXT_NODE && offset > 0) return null
  if (node.nodeType === Node.TEXT_NODE) {
    return node.previousSibling
  }
  if (offset > 0) {
    return node.childNodes[offset - 1]
  }
  return null
}

function getNextSibling(node, offset) {
  if (node.nodeType === Node.TEXT_NODE && offset < (node.textContent?.length || 0)) return null
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nextSibling
  }
  if (offset < node.childNodes.length) {
    return node.childNodes[offset]
  }
  return null
}
