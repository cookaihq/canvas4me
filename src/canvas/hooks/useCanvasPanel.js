import { useCallback, useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasFacade } from '../state/canvasFacade'
import { isFoldedCapability, resolveModeId, getCapabilityPrimaryOutput } from '../registry/nodeTypes'
import { NODE_SIZE_PRESETS } from '../constants/spacing'

/**
 * 节点面板相关状态 hook
 *
 * 管理:
 *   - selectedNodeId: 当前打开面板的节点 id (仅能力/输出节点; 输入节点双击不开面板)
 *   - onNodeDoubleClick: 双击节点 → 触发画布缩放聚焦(节点占屏 ~85%, 仍可正常连线/输入);
 *       能力/输出节点额外打开右侧面板, 输入(内容)节点仅聚焦
 *   - handlePanelClose: 关闭面板
 *   - ESC 键监听: 鼠标不在面板上时按 ESC 关闭
 *
 * 双击聚焦实现: useReactFlow().fitView({ nodes: [target], padding: 0.075 }) -
 *   本质是改 viewport.transform, 节点放大后仍能拖端口/连线/输入文本.
 *   退出: 用户用鼠标滚轮 / 缩放控件缩小画布即可, 无专门退出按钮.
 */
export default function useCanvasPanel() {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const { fitView } = useReactFlow()
  const facade = useCanvasFacade()

  const onNodeDoubleClick = useCallback((event, node) => {
    // 双击落点在可编辑控件(节点名输入框等)内 → 交给浏览器做文字选择/全选,
    // 不触发节点聚焦缩放,也不打开面板
    if (event?.target?.closest?.('input, textarea, [contenteditable]')) return
    // 备注节点双击是编辑文本,不打开面板也不缩放
    if (node.type === 'note') return
    // 输入(内容)节点双击只缩放聚焦,不打开右侧面板; 能力/输出节点才打开面板
    if (node.type !== 'input') setSelectedNodeId(node.id)
    // 折叠图片节点: 双击先 reset 节点宽度到默认值 (348), 高度按当前 aspect 重算,
    // 之后再 fitView, 避免之前用户手动拉大后双击 "聚焦在巨型节点上" 看着突兀
    if (node.type === 'capability' && isFoldedImageNode(node)) {
      const aspect = resolveAspect(node)
      const targetW = NODE_SIZE_PRESETS.image.initial.width
      const targetH = aspect ? Math.round(targetW / aspect) : NODE_SIZE_PRESETS.image.initial.height
      facade.batchUpdateNodes(nds => nds.map(n => (
        n.id === node.id
          ? { ...n, width: targetW, height: targetH, style: { ...n.style, width: targetW, height: targetH } }
          : n
      )))
    }
    // 双击聚焦: 把目标节点 fit 到 85% 视窗(padding 7.5% 即占屏 ~85%)
    // 注意 fitView 仅传 id, 节点尺寸由 React Flow 内部测量
    try {
      fitView({ nodes: [{ id: node.id }], padding: 0.075, duration: 300 })
    } catch (err) {
      console.warn('[useCanvasPanel] fitView 失败:', err?.message)
    }
  }, [fitView, facade])

  const handlePanelClose = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // ESC = 鼠标不在右侧面板上时关闭面板
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (!selectedNodeId) return
      if (document.querySelector('.ai-canvas-panel:hover')) return
      setSelectedNodeId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeId])

  return {
    selectedNodeId,
    setSelectedNodeId,
    onNodeDoubleClick,
    handlePanelClose,
  }
}

function isFoldedImageNode(node) {
  const cap = node.data?.capability
  if (!cap || !isFoldedCapability(cap)) return false
  const modeId = resolveModeId(cap, node.data?.mode)
  const out = getCapabilityPrimaryOutput(cap, modeId)
  return out?.type === 'image'
}

// 双击 reset 节点尺寸时只看图片真实比 (与 CapabilityNode 的 imageBodyAspect 一致):
// 没图片 (Ready / Running / Failed) → 返回 null, 由调用方退化到默认 height (348×465)
function resolveAspect(node) {
  const fromImage = Number(node.data?._imageAspect)
  if (Number.isFinite(fromImage) && fromImage > 0) return fromImage
  return null
}
