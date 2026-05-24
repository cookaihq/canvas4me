import { useCallback, useMemo, useRef, useState } from 'react'
import { message } from 'antd'

import { useUploader } from '@/platform/provider.jsx'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import { PromptTextarea } from '@/canvas/components/fields'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import useCapabilityCredits from '@/canvas/hooks/useCapabilityCredits'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import MoodboardRow from '../_shared/MoodboardRow'
import { LYRIA_MODELS, MAX_MOODBOARD_IMAGES, STRUCTURE_TAGS } from '../_shared/constants'
import '../_shared/lyria3-docked.css'

/**
 * Lyria 3 · 单 mode 折叠 DockedPanel
 * 形态: variant 'default'(紧凑) / 'advanced'(齿轮展开反向提示词) / 'modal'(提示词放大, 也显示反向提示词)。
 */
export default function Lyria3DockedPanel({
  node,
  capability,
  mode,
  params,
  edges,
  nodes,
  isDone,
  paramsUnchanged = false,
  variant = 'default',
  onCapabilityChange,
  onModeChange,
  onParamsChange,
  onRun,
  onRequestVariant,
}) {
  const uploader = useUploader()
  const facade = useCanvasFacade()
  const promptRef = useRef(null)

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // 情绪板来自 images 端口连入
  const moodboardItems = useMemo(() => expandPortInputs({
    targetNodeId: node.id, targetHandle: 'images', edges, nodes,
  }), [edges, nodes, node.id])

  // + 按钮: 新建 image input 节点 + 连到 images 端口
  const handlePickFiles = useCallback((files) => {
    if (!node?.id) return
    const remain = MAX_MOODBOARD_IMAGES - moodboardItems.length
    if (remain <= 0) {
      message.warning(`情绪板最多 ${MAX_MOODBOARD_IMAGES} 张`)
      return
    }
    const accepted = Array.from(files).slice(0, remain)

    const capX = node.position?.x ?? 0
    const capY = node.position?.y ?? 0
    const NEW_NODE_W = 348
    const NODE_GAP = 60
    const COL_GAP = 30
    const existing = edges.filter(e => e.target === node.id && e.targetHandle === 'images').length

    accepted.forEach((file, i) => {
      const slotIndex = existing + i
      const newNode = createInputNode(
        'image',
        { x: capX - NEW_NODE_W - NODE_GAP - slotIndex * (NEW_NODE_W + COL_GAP), y: capY },
        { content: { uploading: true }, name: file.name },
      )
      const newEdgeId = `edge-${newNode.id}-${node.id}-images`
      const newEdge = {
        id: newEdgeId,
        source: newNode.id,
        sourceHandle: 'image',
        target: node.id,
        targetHandle: 'images',
        type: 'custom',
      }

      facade.batchUpdateNodes(nds => [
        ...nds.map(n => (n.id === node.id
          ? { ...n, data: addConnection(n.data, 'images', { source: newNode.id, sourceHandle: 'image' }, true) }
          : n)),
        newNode,
      ])
      facade.batchUpdateEdges(eds => [...eds, newEdge])

      uploader.uploadFile(file)
        .then(result => {
          facade.batchUpdateNodes(nds => nds.map(n => (
            n.id === newNode.id
              ? { ...n, data: { ...n.data, content: { url: result.url, fileName: file.name } } }
              : n
          )))
        })
        .catch(err => {
          message.error(`${file.name} 上传失败: ${err?.message || '未知错误'}`)
          facade.batchUpdateNodes(nds => nds
            .filter(n => n.id !== newNode.id)
            .map(n => (n.id === node.id
              ? { ...n, data: removeConnection(n.data, 'images', newNode.id, 'image') }
              : n)))
          facade.batchUpdateEdges(eds => eds.filter(e => e.id !== newEdgeId))
        })
    })
  }, [node, edges, moodboardItems.length, facade, uploader])

  const handleDeleteMoodboard = useCallback((item) => {
    if (item.source !== 'edge' || !item.edgeId) return
    facade.batchUpdateEdges(eds => eds.filter(e => e.id !== item.edgeId))
    if (item.uploading && item.sourceNodeId) {
      facade.batchUpdateNodes(nds => nds.filter(n => n.id !== item.sourceNodeId))
    }
  }, [facade])

  // prompt 端口 ↔ params.prompt placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
    onChange: (val) => onParamsChange({ prompt: val }),
    nodeId: node.id,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id && e.targetHandle === 'prompt' && e.source === sourceNodeId
    )))
  }, [facade, node.id])

  const promptEdgeId = useMemo(() => {
    const e = edges.find(e => e.target === node.id && e.targetHandle === 'prompt')
    return e ? e.id : null
  }, [edges, node.id])

  // 积分 + Run
  const [runCount, setRunCount] = useState(1)
  const collectedInputs = useMemo(() => ({}), [])  // pricing 不依赖端口值
  const { credits } = useCapabilityCredits(capability, mode, params, collectedInputs)

  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if ((params.prompt || '').trim() === '' && !promptEdgeId) {
      message.warning('请先填写音乐描述或连接 prompt 端口')
      return
    }
    if (moodboardItems.some(i => i.uploading)) {
      message.warning('情绪板还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, params.prompt, promptEdgeId, moodboardItems, onRun, runCount])

  const isModal = variant === 'modal'
  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body lyria3-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* 情绪板参考图 — 常驻，在音乐描述上方 */}
      <MoodboardRow
        items={moodboardItems}
        max={MAX_MOODBOARD_IMAGES}
        showAddButton
        label="情绪板参考图"
        onPickFiles={handlePickFiles}
        onDelete={handleDeleteMoodboard}
      />

      {/* 结构标签快捷插入 — 紧凑态与放大态都显示，点击插到光标处 */}
      <div className="lyria3-tag-row" aria-label="结构标签快捷插入">
        {STRUCTURE_TAGS.map(tag => (
          <button
            key={tag}
            type="button"
            className="lyria3-tag-chip"
            onClick={() => promptRef.current?.insertText(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 音乐描述 */}
      <div className={`lyria3-prompt-wrap${isModal ? ' modal' : ''}`}>
        <TextInputWithEdges
          ref={promptRef}
          value={params.prompt || ''}
          onChange={(v) => onParamsChange({ prompt: v })}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          variant={isModal ? 'modal' : 'inline'}
          placeholder="描述你想要的音乐: 风格 / 情绪 / 乐器 / BPM…"
        />
      </div>

      {/* 高级区: 反向提示词（齿轮展开 advanced，或放大 modal 时显示） */}
      {showAdvanced && (
        <PromptTextarea
          label="反向提示词"
          value={params.negative_prompt || ''}
          onChange={(v) => onParamsChange({ negative_prompt: v })}
          placeholder="描述不希望出现的元素：harsh, distorted, low quality…"
          maxLength={500}
        />
      )}

      {/* 底栏: 模型 chip + 积分 + Run + ×N */}
      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        extraOptions={{ model: { options: LYRIA_MODELS } }}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        credits={credits}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
        showAdvancedGear={true}
      />
    </div>
  )
}
