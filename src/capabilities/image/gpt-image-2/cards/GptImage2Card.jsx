import { memo } from 'react'
import FoldedImagePreviewCard from '@/canvas/renderers/folded/FoldedImagePreviewCard'

/**
 * GPT Image 2 (完整版) 节点本体卡片 — 折叠形态(form 'folded')
 *
 * 节点本体只渲染产物预览区: 状态点由 FoldedNodeMeta 的兄弟层 capability-node
 * 通过 --status-color 表现; meta 元数据由 FoldedNodeMeta 渲染.
 * 本组件聚焦"产物展示 + 状态过渡":
 *   - Ready  : 占位提示 (等待 prompt / 点 Run)
 *   - Running: 进度条 + Generating...
 *   - Done   : 图片本体 (单图直接展示, 多图 N 宫格); 加载完成后回写节点高度
 *   - Failed : 错误信息 + 重试按钮
 */
function GptImage2Card({ nodeId, data, downstreamOutputNode }) {
  return (
    <FoldedImagePreviewCard
      nodeId={nodeId}
      data={data}
      downstreamOutputNode={downstreamOutputNode}
      readyHint="连接提示词后点击 Run"
    />
  )
}

export default memo(GptImage2Card)
