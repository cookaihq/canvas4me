import { useMemo, useCallback } from 'react'
import { Link, ChevronUp, ChevronDown } from '@/canvas/icons'
import { useCanvasFacade } from '../state/canvasFacade'
import { useMediaSource } from '../hooks/useMediaSource'

function PortThumb({ content }) {
  const { displayUrl, markError } = useMediaSource(content.url, { kind: 'image' })
  return (
    <img
      src={displayUrl}
      alt={content.fileName || ''}
      className="connected-port-thumb"
      onError={markError}
    />
  )
}

/**
 * 连线占用时的只读展示组件
 *
 * 当端口被画布连线占用时，面板中对应区域显示此组件：
 * - 文本端口（accept 含 'text'）：展示连入节点的文本内容
 * - 图片/文件端口：展示连入节点列表，支持上移/下移排序
 *
 * @param {string} portId - 端口 ID
 * @param {string} portLabel - 端口标签
 * @param {Array<string>} accept - 端口 accept 类型数组（registry 定义）
 * @param {Array} sources - 连入的源节点列表
 * @param {Array} edges - 当前所有连线
 * @param {string} nodeId - 当前能力节点 ID
 */
export default function ConnectedPortDisplay({ portId, portLabel, accept, sources, edges, nodeId }) {
  const facade = useCanvasFacade()

  // 按连线在 edges 数组中的顺序排列 sources
  const orderedEdges = useMemo(() => {
    if (!edges || !nodeId) return []
    return edges.filter(e => e.target === nodeId && e.targetHandle === portId)
  }, [edges, nodeId, portId])

  const orderedSources = useMemo(() => {
    return orderedEdges
      .map(e => sources.find(s => s.id === e.source))
      .filter(Boolean)
  }, [orderedEdges, sources])

  // 上移/下移：通过交换 edges 数组中的顺序实现
  const handleMove = useCallback((index, direction) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= orderedEdges.length) return

    const edgeA = orderedEdges[index]
    const edgeB = orderedEdges[targetIdx]

    facade.batchUpdateEdges(eds => {
      const result = [...eds]
      const idxA = result.findIndex(e => e.id === edgeA.id)
      const idxB = result.findIndex(e => e.id === edgeB.id)
      if (idxA === -1 || idxB === -1) return eds
      ;[result[idxA], result[idxB]] = [result[idxB], result[idxA]]
      return result
    })
  }, [orderedEdges, facade])

  if (orderedSources.length === 0) return null

  // 文本类端口：直接展示文本
  const isTextPort = Array.isArray(accept) && accept.includes('text')

  if (isTextPort) {
    return (
      <div className="connected-port-display">
        <div className="connected-port-badge">
          <Link size={12} /> 由连线输入
        </div>
        {orderedSources.map((node, i) => (
          <div key={node.id} className="connected-port-text-preview">
            {node.data?.content?.text || node.data?.label || '(空)'}
          </div>
        ))}
      </div>
    )
  }

  // 图片/文件/音频/视频端口：展示列表 + 排序按钮
  return (
    <div className="connected-port-display">
      <div className="connected-port-badge">
        <Link /> 由连线输入（{orderedSources.length}）
      </div>
      <div className="connected-port-list">
        {orderedSources.map((node, i) => {
          const content = node.data?.content || {}
          const subType = node.data?.subType
          return (
            <div key={node.id} className="connected-port-item">
              {subType === 'image' && content.url && (
                <PortThumb content={content} />
              )}
              <span className="connected-port-name">
                {content.fileName || node.data?.label || node.id}
              </span>
              {orderedSources.length > 1 && (
                <span className="connected-port-order-btns">
                  <button
                    className="connected-port-order-btn"
                    disabled={i === 0}
                    onClick={() => handleMove(i, 'up')}
                    title="上移"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    className="connected-port-order-btn"
                    disabled={i === orderedSources.length - 1}
                    onClick={() => handleMove(i, 'down')}
                    title="下移"
                  >
                    <ChevronDown size={12} />
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
