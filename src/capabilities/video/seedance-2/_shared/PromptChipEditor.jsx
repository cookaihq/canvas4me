import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import { useNodeSeqMap } from '@/canvas/state/canvasDerived'
import {
  buildSeedancePromptText,
  parseSeedancePromptSegments,
  anchorToSeedancePromptDisplayText,
} from './seedance-prompt'
import { readTextFromEditor } from './readEditorText'
import './prompt-chip-editor.css'

/**
 * Seedance R2V chip prompt 编辑器 — 见 docs/capabilities/video/seedance-2.md §2.7.1
 *
 * 数据流:
 *   - 父组件持有 segments (text/asset 混合数组), 父组件序列化为字符串提交
 *   - 编辑器把 asset 段渲染成 contentEditable=false 的 chip (缩略图 + #N 索引)
 *   - 用户输入 / 删除 → 从 DOM 提取最新 segments 回写
 *   - assetMap 由父组件传入: { 'image-1': { url, type }, ... } 用于 chip 缩略图渲染
 *
 * 简化策略 (任务说明里允许):
 *   - 已实现: text 段 + asset chip 渲染 + 程序化插入 chip + serialize
 *   - 已实现: 纯文本 @Image1 自动检测转 chip (基于 parseSeedancePromptSegments)
 *   - 已实现: 悬空 chip (asset anchor 不在 assetMap) 用红色 ⚠ 视觉
 *   - 未做: 复杂的多行段落 + 选区跨 chip 的精细处理 — 普通输入足够稳
 */
const PromptChipEditor = forwardRef(function PromptChipEditor({
  segments = [],
  onSegmentsChange,
  assetMap = {},
  nodes = [],         // React Flow 节点 (edge chip 渲染需查源节点)
  onChipDelete,       // edge chip × 点击回调 (调用方负责 setEdges 删 edge)
  disabled = false,
  placeholder = '描述想要生成的视频，可输入 @Image1 / @Video2 / @Audio3 引用素材…',
}, ref) {
  const editorRef = useRef(null)
  const isComposingRef = useRef(false)
  const lastTextRef = useRef('')
  const assetMapRef = useRef(assetMap)
  const nodesRef = useRef(nodes)
  // 节点序号是派生属性(不在 node.data 上),chip 的 #N 从派生序号表取;存 ref 供裸 DOM 渲染函数读
  const seqMap = useNodeSeqMap()
  const seqMapRef = useRef(seqMap)
  useEffect(() => { assetMapRef.current = assetMap }, [assetMap])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { seqMapRef.current = seqMap }, [seqMap])

  // 外部 segments 变了 + 编辑器内 DOM 与之不同 → 重渲染
  useEffect(() => {
    if (!editorRef.current) return
    const currentText = readTextFromEditor(editorRef.current)
    const incomingText = buildSeedancePromptText(segments)
    if (currentText === incomingText) {
      // 文本没变, 但 chip 缩略图 / edge chip 内文字 / 序号 可能要刷 (assetMap / nodes / seq 变了)
      refreshChipThumbs(editorRef.current, assetMapRef.current)
      refreshEdgeChipSeq(editorRef.current, seqMapRef.current)
      return
    }
    lastTextRef.current = incomingText
    renderSegmentsToEditor(editorRef.current, segments, assetMapRef.current, nodesRef.current, seqMapRef.current)
  }, [segments, assetMap, nodes, seqMap])

  // edge chip × 删除事件 delegation
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

  const emitFromDom = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const text = readTextFromEditor(editor)
    lastTextRef.current = text
    // 解析回 segments — 这一步顺便把 @Image1 自动转 chip
    const next = parseSeedancePromptSegments(text)
    onSegmentsChange?.(next)
  }, [onSegmentsChange])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const text = readTextFromEditor(editor)
    lastTextRef.current = text

    // 检查是否需要把"@Image1"这种纯文本转 chip
    const hasNewToken = /@(?:Image|Video|Audio|图像|视频|音频)\d+/i.test(text)
    if (hasNewToken) {
      const sel = window.getSelection()
      const range = sel?.rangeCount > 0 ? sel.getRangeAt(0) : null
      const cursorOffset = range ? getTextOffset(editor, range.startContainer, range.startOffset) : text.length

      const segmentsParsed = parseSeedancePromptSegments(text)
      renderSegmentsToEditor(editor, segmentsParsed, assetMapRef.current, nodesRef.current, seqMapRef.current)
      restoreCursor(editor, cursorOffset)
      onSegmentsChange?.(segmentsParsed)
      return
    }

    onSegmentsChange?.(parseSeedancePromptSegments(text))
  }, [onSegmentsChange])

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
      if (node?.classList?.contains('sd2-chip')) {
        e.preventDefault()
        node.remove()
        emitFromDom()
        return
      }
      // edge chip (atomic 删除 + 同步删 edge)
      if (node?.classList?.contains('tp-chip')) {
        e.preventDefault()
        const sid = node.dataset?.sourceNodeId
        node.remove()
        emitFromDom()
        if (sid) onChipDelete?.(sid)
        return
      }
    }
  }, [emitFromDom, onChipDelete])

  const handlePaste = useCallback((e) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    if (!text) return
    document.execCommand('insertText', false, text)
  }, [])

  const insertAnchor = useCallback((anchor) => {
    const editor = editorRef.current
    if (!editor || !anchor) return
    const chip = createChipNode(anchor, assetMapRef.current)
    const space = document.createTextNode(' ')

    const sel = window.getSelection()
    if (sel?.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(space)
      range.insertNode(chip)
      range.setStartAfter(space)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editor.appendChild(chip)
      editor.appendChild(space)
    }
    editor.focus()
    emitFromDom()
  }, [emitFromDom])

  useImperativeHandle(ref, () => ({ insertAnchor }), [insertAnchor])

  const isEmpty = !buildSeedancePromptText(segments).trim()

  return (
    <div className={`sd2-chip-editor${disabled ? ' disabled' : ''}`}>
      <div
        ref={editorRef}
        className="sd2-chip-editor-area"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        role="textbox"
        aria-multiline="true"
      />
      {isEmpty && <div className="sd2-chip-editor-placeholder">{placeholder}</div>}
    </div>
  )
})

export default PromptChipEditor

// ─── DOM helpers ───

// 共用 .tp-chip CSS — 文本端口连入的 chip (跟 LLM / GPT-Image-2 视觉一致)
function createEdgeChipNode(sourceNodeId, sourceNode, seqMap) {
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

function createChipNode(anchor, assetMap) {
  const asset = assetMap?.[anchor]
  const chip = document.createElement('span')
  chip.className = 'sd2-chip'
  chip.contentEditable = 'false'
  chip.dataset.anchor = anchor

  // orphan 标记 — 引用了但 assetMap 找不到对应素材
  if (!asset) {
    chip.classList.add('sd2-chip-orphan')
  }

  if (asset?.url && asset.type === 'image') {
    const img = document.createElement('img')
    img.className = 'sd2-chip-thumb'
    img.src = asset.url
    img.draggable = false
    img.onerror = () => { img.style.display = 'none' }
    chip.appendChild(img)
  }
  // video / audio chip 不渲染缩略图 (只用文字 + 类型 hint), 简化版

  const text = document.createElement('span')
  text.className = 'sd2-chip-text'
  text.textContent = asset
    ? anchorToSeedancePromptDisplayText(anchor)
    : `${anchorToSeedancePromptDisplayText(anchor)}?`
  chip.appendChild(text)

  return chip
}

function renderSegmentsToEditor(editor, segments, assetMap, nodes, seqMap) {
  if (!editor) return
  editor.innerHTML = ''
  const nodesById = new Map((nodes || []).map(n => [n.id, n]))
  segments.forEach((segment) => {
    if (segment.type === 'asset' && segment.anchor) {
      editor.appendChild(createChipNode(segment.anchor, assetMap))
    } else if (segment.type === 'edge' && segment.sourceNodeId) {
      const sourceNode = nodesById.get(segment.sourceNodeId)
      if (!sourceNode) {
        // 节点不存在(跨画布粘贴 / 节点已删) → 字面字符串保留
        editor.appendChild(document.createTextNode(`{{ai-canvas:edge:${segment.sourceNodeId}}}`))
      } else {
        editor.appendChild(createEdgeChipNode(segment.sourceNodeId, sourceNode, seqMap))
      }
    } else if (segment.type === 'text') {
      editor.appendChild(document.createTextNode(segment.text))
    }
  })
}

// 文本未变(只是序号刷新)时, 原地更新 edge chip 的 #N 文案, 不重建 DOM(保护光标)
function refreshEdgeChipSeq(editor, seqMap) {
  if (!editor) return
  editor.querySelectorAll('.tp-chip').forEach((chip) => {
    const sid = chip.dataset.sourceNodeId
    const head = chip.querySelector('.tp-chip-head')
    if (!head) return
    const seq = seqMap?.get(sid)
    const seqLabel = typeof seq === 'number' ? `#${seq}` : '#?'
    const lastTextNode = Array.from(head.childNodes).reverse().find((n) => n.nodeType === Node.TEXT_NODE)
    if (lastTextNode && lastTextNode.textContent !== seqLabel) lastTextNode.textContent = seqLabel
  })
}

function refreshChipThumbs(editor, assetMap) {
  if (!editor) return
  editor.querySelectorAll('.sd2-chip').forEach((chip) => {
    const anchor = chip.dataset.anchor
    const asset = assetMap?.[anchor]
    const isOrphan = !asset
    chip.classList.toggle('sd2-chip-orphan', isOrphan)
    const textNode = chip.querySelector('.sd2-chip-text')
    if (textNode) {
      textNode.textContent = isOrphan
        ? `${anchorToSeedancePromptDisplayText(anchor)}?`
        : anchorToSeedancePromptDisplayText(anchor)
    }
    const existingThumb = chip.querySelector('.sd2-chip-thumb')
    if (asset?.url && asset.type === 'image') {
      if (existingThumb) {
        existingThumb.src = asset.url
      } else {
        const img = document.createElement('img')
        img.className = 'sd2-chip-thumb'
        img.src = asset.url
        img.draggable = false
        chip.insertBefore(img, chip.firstChild)
      }
    } else if (existingThumb) {
      existingThumb.remove()
    }
  })
}

function getTextOffset(root, targetNode, targetOffset) {
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  let node = walker.nextNode()
  while (node) {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) return offset + targetOffset
      return offset
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0
    } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.anchor) {
      const [type, idx] = node.dataset.anchor.split('-')
      const tokenText = type === 'image' ? `@Image${idx}`
        : type === 'video' ? `@Video${idx}`
        : type === 'audio' ? `@Audio${idx}` : node.dataset.anchor
      offset += tokenText.length
      let next = walker.nextNode()
      while (next && node.contains(next)) next = walker.nextNode()
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
    } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.anchor) {
      const [type, idx] = node.dataset.anchor.split('-')
      const tokenText = type === 'image' ? `@Image${idx}`
        : type === 'video' ? `@Video${idx}`
        : type === 'audio' ? `@Audio${idx}` : node.dataset.anchor
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
      while (next && node.contains(next)) next = walker.nextNode()
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
  if (node.nodeType === Node.TEXT_NODE) return node.previousSibling
  if (offset > 0) return node.childNodes[offset - 1]
  return null
}

function getNextSibling(node, offset) {
  if (node.nodeType === Node.TEXT_NODE && offset < (node.textContent?.length || 0)) return null
  if (node.nodeType === Node.TEXT_NODE) return node.nextSibling
  if (offset < node.childNodes.length) return node.childNodes[offset]
  return null
}
