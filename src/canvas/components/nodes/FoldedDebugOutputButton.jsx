import { memo, useState } from 'react'
import { Modal } from '@/canvas/components/AntdWrappers'
import useDebugMode from '../../hooks/useDebugMode'
import OutputPanel from '../../panels/OutputPanel'

/**
 * 折叠形态能力节点 — debugMode 浮层"输出"按钮
 *
 * 位置: 节点 body 区域 (header 下方) 右上角, 绝对定位浮在图片之上.
 * 不占据 header 排版空间, 不影响图片严格按 aspect 联动.
 *
 * 仅在 debugMode = true 时渲染. 点击弹 Modal 形态的 OutputPanel,
 * 与折叠前的产物详情入口等价.
 */
function FoldedDebugOutputButton({ nodeId, data, downstreamOutputNode }) {
  const debugMode = useDebugMode()
  const [open, setOpen] = useState(false)

  if (!debugMode) return null

  // OutputPanel 需要一个 outputNode 形态的 node; 折叠态下还没建出 outputNode (Ready)
  // 时退化为 capability 节点自身做 fallback
  const panelNode = downstreamOutputNode || {
    id: nodeId,
    type: 'capability',
    data: {
      ...(data || {}),
      sourceCapability: data?.capability,
    },
  }

  return (
    <>
      <button
        type="button"
        className="folded-debug-output-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="查看产物详情 (debugMode)"
      >
        输出
      </button>
      <Modal
        title="产物详情"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <OutputPanel node={panelNode} />
      </Modal>
    </>
  )
}

export default memo(FoldedDebugOutputButton)
