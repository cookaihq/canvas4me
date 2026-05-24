import { useCallback } from 'react'
import { message } from 'antd'
import {
  createInputNode,
  createCapabilityNode,
  createNoteNode,
} from '../utils/nodeFactory'
import { resolveInitialCapability } from '../utils/capabilityDefaults'
import { useUploader } from '@/platform/provider.jsx'
import { useCanvasFacade } from '../state/canvasFacade'

export default function useNodeInsertion({ isEditing, viewport, setNodes, nodeZCounterRef }) {
  const { getViewportCenter, centerNodeAt, findFreeSpot, panCanvasTo } = viewport
  const uploader = useUploader()
  const facade = useCanvasFacade()

  // 新建节点统一 bring-to-front:复用画布的 nodeZCounterRef,让新节点的 zIndex 大于
  // 已存在节点(包括 click 过的老节点),避免新节点被压在底下
  const handleInsertNode = useCallback(async (subType, file) => {
    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }
    const center = findFreeSpot(getViewportCenter())

    if (subType === 'note') {
      const node = centerNodeAt(createNoteNode(center), center)
      facade.addNodes({ ...node, zIndex: nodeZCounterRef.current++ })
      panCanvasTo(center)
      return
    }

    const extraData = {}
    if (file) {
      try {
        const result = await uploader.uploadFile(file)
        extraData.content = { url: result.url, fileName: file.name }
        extraData.name = file.name
      } catch (err) {
        message.error('上传失败: ' + err.message)
        return
      }
    }

    const node = centerNodeAt(createInputNode(subType, center, extraData), center)
    facade.addNodes({ ...node, zIndex: nodeZCounterRef.current++ })
    panCanvasTo(center)
  }, [isEditing, getViewportCenter, setNodes, centerNodeAt, panCanvasTo, findFreeSpot, nodeZCounterRef, uploader, facade])

  const handleInsertCapability = useCallback((nodeType) => {
    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }
    const center = findFreeSpot(getViewportCenter())
    const { capability, mode } = resolveInitialCapability(nodeType)
    // 折叠能力返回 [能力节点, output] + internal 边;非折叠只返回 [能力节点]。
    // 居中主能力节点(nodes[0]),其余节点(常驻 output)按同一位移跟随,保持相对位置。
    const { nodes: created, edges } = createCapabilityNode(nodeType, center, capability, { mode })
    const centeredMain = centerNodeAt(created[0], center)
    const dx = centeredMain.position.x - created[0].position.x
    const dy = centeredMain.position.y - created[0].position.y
    const placed = created.map((n, i) => i === 0
      ? centeredMain
      : { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } })
    facade.batchUpdateNodes(prev => [
      ...prev.map(n => (n.selected ? { ...n, selected: false } : n)),
      ...placed.map((n, i) => ({
        ...n,
        ...(i === 0 ? { selected: true } : {}),
        zIndex: nodeZCounterRef.current++,
      })),
    ])
    if (edges.length) facade.addEdges(edges)
    panCanvasTo(center)
  }, [isEditing, getViewportCenter, setNodes, centerNodeAt, panCanvasTo, findFreeSpot, nodeZCounterRef, facade])

  return { handleInsertNode, handleInsertCapability }
}
