import { useCallback, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { message } from 'antd'
import {
  createInputNode,
  createCapabilityNode,
  createNoteNode,
} from '../utils/nodeFactory'
import { resolveInitialCapability } from '../utils/capabilityDefaults'
import { CAPABILITY_STACK_GAP } from '../constants/spacing'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 画布右键菜单 hook
 *
 * 职责:
 *   - 管理 contextMenu state(空白处右键 / 节点右键 / 多选右键)
 *   - 调度菜单 action 到对应行为(插入节点 / 复制粘贴 / 删除)
 *
 * 依赖项以参数注入(画布层不在此 hook 内部拿,保持单向依赖):
 *
 * @param {object} opts
 * @param {boolean} opts.isEditing                       编辑模式
 * @param {Array}   opts.nodes                           节点列表
 * @param {Array}   opts.edges                           边列表
 * @param {Function} opts.setNodes                       节点 setter
 * @param {Function} opts.setEdges                       边 setter
 * @param {object}  opts.viewport                        useCanvasViewport 返回值
 * @param {object}  opts.clipboard                       { paste, copySelected, selectAll, deleteSelected }
 * @param {(nodeId: string) => void} opts.onOpenPanel    打开节点面板回调
 */
export default function useCanvasContextMenu({
  isEditing,
  nodes,
  edges,
  setNodes,
  setEdges,
  viewport,
  clipboard,
  onOpenPanel,
}) {
  const { screenToFlowPosition } = useReactFlow()
  const facade = useCanvasFacade()
  const [contextMenu, setContextMenu] = useState(null)

  // nodes 兜 ref, 让 onNodeContextMenu 引用 mount 后永不变.
  // 否则它作为 ReactFlow tracked prop, 每渲染换引用就会让 StoreUpdater
  // 反复 store.setState, 触发"Maximum update depth"风险, 详见 useCanvasConnection.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault()
    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      target: { type: 'blank' },
      flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    })
  }, [screenToFlowPosition])

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault()
    const selectedCount = nodesRef.current.filter(n => n.selected).length
    const targetType = selectedCount > 1
      ? 'multiSelect'
      : 'node'

    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      target: { type: targetType, nodeId: node.id, nodeType: node.type },
      flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    })
  }, [screenToFlowPosition])

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleContextMenuAction = useCallback((action, payload) => {
    if (!isEditing && !['openPanel', 'copy', 'selectAll'].includes(action)) {
      message.info('当前为只读模式')
      return
    }

    const pos = contextMenu?.flowPosition || viewport.getViewportCenter()

    switch (action) {
      case 'insertInput': {
        const node = createInputNode(payload.subType, pos)
        facade.addNodes(node)
        break
      }
      case 'insertCapability': {
        const { capability, mode } = resolveInitialCapability(payload.nodeType)
        // 折叠能力返回 [能力节点, output] + internal 边;非折叠只返回 [能力节点]。
        // 节点直接落在右键位置,output 由工厂排在能力节点右侧,无需居中位移。
        const { nodes: created, edges } = createCapabilityNode(payload.nodeType, pos, capability, { mode })
        facade.batchUpdateNodes(prev => [
          ...prev.map(n => (n.selected ? { ...n, selected: false } : n)),
          ...created.map((n, i) => (i === 0 ? { ...n, selected: true } : n)),
        ])
        if (edges.length) facade.addEdges(edges)
        break
      }
      case 'insertNote': {
        const node = createNoteNode(pos)
        facade.addNodes(node)
        break
      }
      case 'paste':
        clipboard.paste()
        break
      case 'selectAll':
        clipboard.selectAll()
        break
      case 'copy': {
        // 单节点右键"复制":立即在正下方克隆节点,并把所有入边指向新节点
        if (contextMenu?.target?.type === 'node' && contextMenu.target.nodeId) {
          const origin = nodes.find(n => n.id === contextMenu.target.nodeId)
          if (!origin) break
          const rawH = origin.measured?.height ?? origin.height ?? origin.style?.height
          const height = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 200
          const now = Date.now()
          const prefix = origin.id.split('-')[0]
          const newNodeId = `${prefix}-dup-${now}`
          const newNode = {
            ...origin,
            id: newNodeId,
            position: { x: origin.position.x, y: origin.position.y + height + CAPABILITY_STACK_GAP },
            selected: false,
            data: { ...JSON.parse(JSON.stringify(origin.data)), locked: false, canvasSeq: undefined },
          }
          const incomingEdges = edges
            .filter(e => e.target === origin.id)
            .map((e, i) => ({
              ...e,
              id: `edge-dup-${now}-${i}`,
              target: newNodeId,
              selected: false,
            }))
          facade.addNodes(newNode)
          if (incomingEdges.length > 0) {
            facade.addEdges(incomingEdges)
          }
        } else {
          clipboard.copySelected()
        }
        break
      }
      case 'delete':
        clipboard.deleteSelected()
        break
      case 'openPanel':
        onOpenPanel?.(payload.nodeId)
        break
      case 'resetNode': {
        facade.updateNodeData(payload.nodeId, {
          runStatus: 'idle',
          locked: false,
          lastRunSnapshot: null,
        })
        break
      }
      default:
        break
    }
  }, [
    isEditing, contextMenu, viewport, nodes, edges,
    setNodes, setEdges, clipboard, onOpenPanel, facade,
  ])

  return {
    contextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    handleContextMenuClose,
    handleContextMenuAction,
  }
}
