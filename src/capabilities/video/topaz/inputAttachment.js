import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'

const VIDEO_NODE_W = 620
const NODE_GAP = 60

export function createTopazVideoInputAttachment({ capabilityNode, fileName, createInputNode }) {
  if (typeof createInputNode !== 'function') {
    throw new Error('[topaz] createInputNode is required')
  }
  const capX = capabilityNode?.position?.x ?? 0
  const capY = capabilityNode?.position?.y ?? 0
  const inputNode = createInputNode(
    'video',
    { x: capX - VIDEO_NODE_W - NODE_GAP, y: capY },
    {
      content: { uploading: true },
      name: fileName,
    }
  )

  const edge = {
    id: `edge-${inputNode.id}-${capabilityNode.id}-video`,
    source: inputNode.id,
    sourceHandle: 'video',
    target: capabilityNode.id,
    targetHandle: 'video',
    type: 'custom',
  }

  return { inputNode, edge }
}

export function insertTopazVideoInputAttachment(nodes, attachment) {
  const { inputNode, edge } = attachment
  return [
    ...nodes.map((node) => {
      if (node.id !== edge.target) return node
      return {
        ...node,
        data: addConnection(node.data, 'video', {
          source: inputNode.id,
          sourceHandle: 'video',
        }, false),
      }
    }),
    inputNode,
  ]
}

export function replaceTopazVideoInputEdge(edges, attachment) {
  const { edge } = attachment
  return [
    ...edges.filter((item) => !(item.target === edge.target && item.targetHandle === 'video')),
    edge,
  ]
}

export function applyTopazVideoUploadSuccess(nodes, { inputNodeId, uploadResult, fileName, duration }) {
  return nodes.map((node) => (
    node.id === inputNodeId
      ? {
          ...node,
          data: {
            ...node.data,
            content: {
              url: uploadResult.url,
              fileName,
              duration,
            },
          },
        }
      : node
  ))
}

export function removeTopazVideoInputAttachment(nodes, attachment) {
  const { inputNode, edge } = attachment
  return nodes
    .filter((node) => node.id !== inputNode.id)
    .map((node) => {
      if (node.id !== edge.target) return node
      return {
        ...node,
        data: removeConnection(node.data, 'video', inputNode.id, 'video'),
      }
    })
}

export function removeTopazVideoInputConnection(nodes, {
  targetNodeId,
  sourceNodeId,
  sourceHandle = 'video',
  removeSourceNode = false,
}) {
  return nodes
    .filter((node) => !(removeSourceNode && node.id === sourceNodeId))
    .map((node) => {
      if (node.id !== targetNodeId) return node
      return {
        ...node,
        data: removeConnection(node.data, 'video', sourceNodeId, sourceHandle),
      }
    })
}
