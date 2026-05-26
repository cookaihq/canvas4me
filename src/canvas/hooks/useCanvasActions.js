import { useCallback, useEffect, useRef } from 'react'
import { message } from 'antd'
import { isOutputNodeType, isFoldedCapability } from '../registry/nodeTypes'
import { removeConnection } from '../utils/capabilityNodeData'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 画布操作 Hook — 快捷键 + 复制/粘贴/删除/全选
 *
 * @param {{
 *   nodes: Array,
 *   edges: Array,
 *   setNodes: Function,
 *   setEdges: Function,
 *   isEditing: boolean,
 *   getViewport: Function,
 *   onImagePaste?: (file: File) => void,
 *   nodeZCounterRef: { current: number },   // 画布 z-index 单调计数器(bring-to-front)
 * }} opts
 */
export default function useCanvasActions({ nodes, edges, setNodes, setEdges, isEditing, getViewport, onImagePaste, nodeZCounterRef }) {
  const facade = useCanvasFacade()
  const clipboardRef = useRef({ nodes: [], edges: [] })

  // 复制选中节点（含连接选中节点之间的边）
  const copySelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected)
    if (selectedNodes.length === 0) return

    const selectedIds = new Set(selectedNodes.map(n => n.id))
    // 找出连接选中节点之间的边
    const relatedEdges = edges.filter(
      e => selectedIds.has(e.source) && selectedIds.has(e.target)
    )

    clipboardRef.current = {
      nodes: selectedNodes.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)), position: { ...n.position } })),
      edges: relatedEdges.map(e => ({ ...e })),
    }
  }, [nodes, edges])

  // 粘贴：生成新 ID，位置偏移 +20px
  const paste = useCallback(() => {
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current
    if (clipNodes.length === 0) return

    const idMap = {}
    const now = Date.now()

    const newNodes = clipNodes.map((n, i) => {
      const newId = `${n.id.split('-')[0]}-paste-${now}-${i}`
      idMap[n.id] = newId
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 20, y: n.position.y + 20 },
        selected: true,
        // portConnections 必须清空：否则继承的连线历史会在切 mode 时被 reconcileOnModeChange 重建成幽灵边
        // canvasSeq 不沿用源节点，setNodes 内重新分配
        data: n.type === 'capability'
          ? {
            ...JSON.parse(JSON.stringify(n.data)),
            locked: false,
            portConnections: {},
            canvasSeq: undefined,
            runStatus: 'idle',
            lastRunSnapshot: null,
            userTouched: {},
          }
          : { ...JSON.parse(JSON.stringify(n.data)), locked: false, portConnections: {}, canvasSeq: undefined },
      }
    })

    const newEdges = clipEdges
      .filter(e => idMap[e.source] && idMap[e.target])
      .map((e, i) => ({
        ...e,
        id: `edge-paste-${now}-${i}`,
        source: idMap[e.source],
        target: idMap[e.target],
        selected: true,
      }))

    // 节点编号由 canvas/index.jsx 用 computeNodeSeqMap 派生, 此处不再写 canvasSeq
    // 粘贴后让新节点成为唯一选中: 先取消现有选中, 再加入 selected:true 的新节点/边
    // bring-to-front: 给每个粘贴节点写一个比当前所有节点高的 zIndex
    facade.batchUpdateNodes(prev => prev.map(n => (n.selected ? { ...n, selected: false } : n)))
    facade.batchUpdateEdges(prev => prev.map(e => (e.selected ? { ...e, selected: false } : e)))
    facade.addNodes(newNodes.map(n => ({ ...n, zIndex: nodeZCounterRef.current++ })))
    facade.addEdges(newEdges)
  }, [facade, nodeZCounterRef])

  // 删除选中节点和连线
  // 能力节点 → 输出节点 的连线受保护，不能单独删除；只有在输出节点本身被删除时跟随清理。
  //
  // 折叠形态(form 'folded')联动: 删能力节点时, 同步删它下游被折叠的输出节点 + 相关连线
  // (静默删除, 不弹确认; 视觉上"产物随能力节点一起没了"). 详见
  // docs/archive/20260501-folded-ability-node.md §6.1 (删除联动).
  const deleteSelected = useCallback(() => {
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const selectedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id))
    const hasSelectedEdges = edges.some(e => e.selected)

    if (selectedNodeIds.size === 0 && !hasSelectedEdges) return

    // 折叠形态删除联动: 选中的能力节点若是 folded, 把它下游 outputNode 加入待删集合
    for (const id of Array.from(selectedNodeIds)) {
      const n = nodeById.get(id)
      if (n?.type !== 'capability') continue
      if (!isFoldedCapability(n.data?.capability)) continue
      for (const edge of edges) {
        if (edge.source !== id) continue
        const target = nodeById.get(edge.target)
        if (target && isOutputNodeType(target.type)) {
          selectedNodeIds.add(target.id)
        }
      }
    }

    const isProtectedAbilityOutputEdge = (edge) => {
      const sourceNode = nodeById.get(edge.source)
      const targetNode = nodeById.get(edge.target)
      return sourceNode?.type === 'capability' && targetNode && isOutputNodeType(targetNode.type)
    }

    let blockedProtectedEdge = false

    // 先算出实际会被删除的 edges，用于同步清理 portConnections（否则端口连线历史会残留，切 mode 时被 reconcileOnModeChange 重建成幽灵边）
    const removedEdges = edges.filter(e => {
      const touchesRemovedNode = selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target)
      if (touchesRemovedNode) return true
      if (e.selected) {
        if (isProtectedAbilityOutputEdge(e)) {
          blockedProtectedEdge = true
          return false
        }
        return true
      }
      return false
    })

    facade.batchUpdateNodes(prev => prev
      .filter(n => !selectedNodeIds.has(n.id))
      .map(n => {
        if (n.type !== 'capability') return n
        const relevant = removedEdges.filter(e => e.target === n.id && e.targetHandle)
        if (relevant.length === 0) return n
        let data = n.data
        for (const e of relevant) {
          data = removeConnection(data, e.targetHandle, e.source, e.sourceHandle)
        }
        return data === n.data ? n : { ...n, data }
      })
    )
    facade.batchUpdateEdges(prev => prev.filter(e => {
      const touchesRemovedNode = selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target)
      if (touchesRemovedNode) return false
      if (e.selected) {
        if (isProtectedAbilityOutputEdge(e)) return true
        return false
      }
      return true
    }))

    if (blockedProtectedEdge) {
      message.info('能力节点与输出节点之间的连线不能单独删除，如需移除请删除输出节点')
    }
  }, [nodes, edges, facade])

  // 全选
  const selectAll = useCallback(() => {
    facade.batchUpdateNodes(prev => prev.map(n => ({ ...n, selected: true })))
    facade.batchUpdateEdges(prev => prev.map(e => ({ ...e, selected: true })))
  }, [facade])

  // 键盘事件
  useEffect(() => {
    const handler = (e) => {
      // 忽略 IME 组合输入（中文/日文/韩文输入法）
      if (e.isComposing || e.keyCode === 229) return

      // 忽略在输入框中的按键
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'c') {
        // 存在文本选区时交给浏览器原生复制，不拦截
        const selection = window.getSelection?.()
        if (selection && !selection.isCollapsed && selection.toString().length > 0) return
        e.preventDefault()
        copySelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isEditing) return
        e.preventDefault()
        deleteSelected()
      } else if (mod && e.key === 'a') {
        e.preventDefault()
        selectAll()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [copySelected, deleteSelected, selectAll, isEditing])

  // 粘贴事件：优先读系统剪贴板里的图片，没有则走节点粘贴
  useEffect(() => {
    const handler = (e) => {
      // 输入框里的粘贴交给浏览器原生行为
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (!isEditing) return

      // 从剪贴板 items 里找图片
      const items = e.clipboardData?.items || []
      let imageFile = null
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          imageFile = item.getAsFile()
          if (imageFile) break
        }
      }

      if (imageFile && onImagePaste) {
        e.preventDefault()
        onImagePaste(imageFile)
        return
      }

      // 系统剪贴板无图片 → 走内部节点粘贴
      e.preventDefault()
      paste()
    }

    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [isEditing, paste, onImagePaste])

  return { copySelected, paste, deleteSelected, selectAll }
}
