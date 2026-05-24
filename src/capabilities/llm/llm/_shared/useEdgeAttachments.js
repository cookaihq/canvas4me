/**
 * useEdgeAttachments —— 把"上游连入端口的输入节点"转成 thumbnail items + 提供上传/删除处理
 *
 * 行为参照 GptImage2DockedPanel 的参考图行(image input 节点 → 能力节点 image 端口):
 *   - + 按钮上传:在画布左侧空位新建 input 节点 + 连线到目标端口;先 uploading 占位,异步上传完成填 url
 *   - 删除项目:断开连线;占位 uploading 节点同时删除(视为取消上传)
 *
 * 适配 image / video / audio 三种附件 — 调用方按 portId / accept 区分。
 */
import { useCallback, useMemo } from 'react'
import { message } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { useUploader } from '@/platform/provider.jsx'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'

const NEW_NODE_W = 348
const NODE_GAP = 60
const COL_GAP = 30

export default function useEdgeAttachments({
  nodeId,
  capabilityNode,
  edges,
  nodes,
  portId,
  inputSubType,  // 'image' | 'video' | 'audio'
  max,
  validateFile,
}) {
  const facade = useCanvasFacade()
  const uploader = useUploader()

  // 连入该端口的节点列表（含 uploading 占位）
  const items = useMemo(() => {
    return expandPortInputs({
      targetNodeId: nodeId,
      targetHandle: portId,
      edges,
      nodes,
    })
  }, [edges, nodes, nodeId, portId, inputSubType])

  const handlePickFiles = useCallback((files) => {
    if (!capabilityNode?.id) return
    const remain = max - items.length
    if (remain <= 0) {
      message.warning(`最多 ${max} ${LABEL_BY_TYPE[inputSubType] || '个'}`)
      return
    }
    const accepted = Array.from(files).slice(0, remain)

    if (typeof validateFile === 'function') {
      const passed = []
      const rejected = []
      for (const f of accepted) {
        const r = validateFile(f)
        if (r && r.ok === false) rejected.push(`${f.name}(${r.reason})`)
        else passed.push(f)
      }
      if (rejected.length) message.warning(`${rejected.length} 个文件被拒绝：${rejected.join('、')}`)
      if (passed.length === 0) return
      accepted.length = 0
      accepted.push(...passed)
    }

    const capX = capabilityNode.position?.x ?? 0
    const capY = capabilityNode.position?.y ?? 0
    const existingCount = items.length

    accepted.forEach((file, i) => {
      const slotIndex = existingCount + i
      const newNode = createInputNode(
        inputSubType,
        {
          x: capX - NEW_NODE_W - NODE_GAP - slotIndex * (NEW_NODE_W + COL_GAP),
          y: capY,
        },
        { content: { uploading: true }, name: file.name },
      )
      const newEdgeId = `edge-${newNode.id}-${capabilityNode.id}-${portId}`
      const newEdge = {
        id: newEdgeId,
        source: newNode.id,
        sourceHandle: inputSubType,
        target: capabilityNode.id,
        targetHandle: portId,
        type: 'custom',
      }

      facade.batchUpdateNodes(nds => [
        ...nds.map(n => (n.id === capabilityNode.id
          ? { ...n, data: addConnection(n.data, portId, { source: newNode.id, sourceHandle: inputSubType }, true) }
          : n)),
        newNode,
      ])
      facade.addEdges([newEdge])

      uploader.uploadFile(file)
        .then(result => {
          facade.updateNodeData(newNode.id, { content: { url: result.url, fileName: file.name, fileSize: file.size, mimeType: file.type } })
        })
        .catch(err => {
          message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
          facade.batchUpdateNodes(nds => nds
            .filter(n => n.id !== newNode.id)
            .map(n => (n.id === capabilityNode.id
              ? { ...n, data: removeConnection(n.data, portId, newNode.id, inputSubType) }
              : n))
          )
          facade.batchUpdateEdges(eds => eds.filter(e => e.id !== newEdgeId))
        })
    })
  }, [capabilityNode, items.length, inputSubType, portId, max, validateFile, facade, uploader])

  const handleDelete = useCallback((item) => {
    if (item.source !== 'edge' || !item.edgeId) return
    facade.removeEdges([item.edgeId])
    if (item.uploading && item.sourceNodeId) {
      facade.removeNodes([item.sourceNodeId])
    }
  }, [facade])

  return { items, handlePickFiles, handleDelete }
}

const LABEL_BY_TYPE = {
  image: '张图片',
  video: '段视频',
  audio: '段音频',
  file: '个文件',
}
