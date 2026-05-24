import { useCallback, useMemo, useState } from 'react'
import { Segmented, Switch, message } from 'antd'
import { useUploader } from '@/platform/provider.jsx'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { createInputNode } from '@/canvas/utils/nodeFactory'
import { addConnection, removeConnection } from '@/canvas/utils/capabilityNodeData'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import NanoBananaReferenceRow from '../_shared/NanoBananaReferenceRow'
import { MODEL_PRO } from '../constants'
import '../_shared/nano-banana.css'

/**
 * Nano Banana 折叠态 DockedPanel
 *
 * 布局（自上而下）：
 *   DockedTopBar → 参考图行（NanoBananaReferenceRow）→ 提示词（TextInputWithEdges）
 *   → DockedBottomBar → 高级区（output_format / google_search / image_search）
 *
 * 关键：不传 extraOptions 给 DockedBottomBar → model/aspect_ratio/resolution
 * 全部进同一个 ParamChip 合并 popover（见 register.js 设计注释）。
 */

const OUTPUT_FORMAT_OPTIONS = [
  { value: '',     label: '默认' },
  { value: 'jpg',  label: 'JPG' },
  { value: 'png',  label: 'PNG' },
  { value: 'webp', label: 'WEBP' },
]

const MAX_REF = 14

export default function NanoBananaDockedPanel({
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

  // 当前 mode 的 commonParams（从注册器读）
  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // 参考图来自端口连入
  const referenceItems = useMemo(() => {
    return expandPortInputs({
      targetNodeId: node.id,
      targetHandle: 'image',
      edges,
      nodes,
    })
  }, [edges, nodes, node.id])

  // + 按钮：在画布上新建 image input 节点 + 连线
  const handlePickFiles = useCallback((files) => {
    if (!node?.id) return
    const remain = MAX_REF - referenceItems.length
    if (remain <= 0) {
      message.warning('参考图最多 14 张')
      return
    }
    const accepted = Array.from(files).slice(0, remain)

    const capX = node.position?.x ?? 0
    const capY = node.position?.y ?? 0
    const NEW_NODE_W = 348
    const NODE_GAP = 60
    const COL_GAP = 30
    const existingImageEdgeCount = edges
      .filter(e => e.target === node.id && e.targetHandle === 'image').length

    accepted.forEach((file, i) => {
      const slotIndex = existingImageEdgeCount + i
      const newNode = createInputNode(
        'image',
        {
          x: capX - NEW_NODE_W - NODE_GAP - slotIndex * (NEW_NODE_W + COL_GAP),
          y: capY,
        },
        {
          content: { uploading: true },
          name: file.name,
        },
      )
      const newEdgeId = `edge-${newNode.id}-${node.id}-image`
      const newEdge = {
        id: newEdgeId,
        source: newNode.id,
        sourceHandle: 'image',
        target: node.id,
        targetHandle: 'image',
        type: 'custom',
      }

      facade.batchUpdateNodes(nds => [
        ...nds.map(n => (n.id === node.id
          ? { ...n, data: addConnection(n.data, 'image', { source: newNode.id, sourceHandle: 'image' }, true) }
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
              ? { ...n, data: removeConnection(n.data, 'image', newNode.id, 'image') }
              : n))
          )
          facade.batchUpdateEdges(eds => eds.filter(e => e.id !== newEdgeId))
        })
    })
  }, [node, edges, referenceItems.length, facade, uploader])

  const handleDeleteReference = useCallback((item) => {
    if (item.source !== 'edge' || !item.edgeId) return
    facade.batchUpdateEdges(eds => eds.filter(e => e.id !== item.edgeId))
    if (item.uploading && item.sourceNodeId) {
      facade.batchUpdateNodes(nds => nds.filter(n => n.id !== item.sourceNodeId))
    }
  }, [facade])

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
    onChange: (val) => onParamsChange({ prompt: val }),
    nodeId: node.id,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id &&
      e.targetHandle === 'prompt' &&
      e.source === sourceNodeId
    )))
  }, [facade, node.id])

  // Run
  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    if (referenceItems.some(i => i.uploading)) {
      message.warning('参考图还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount, referenceItems])

  const isModal = variant === 'modal'
  const showAdvanced = variant === 'advanced' || variant === 'modal'
  const isPro = (params.model || '') === MODEL_PRO

  return (
    <div className="docked-panel-body">
      {/* 顶栏 */}
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* 参考图行（在提示词上方） */}
      <NanoBananaReferenceRow
        items={referenceItems}
        max={MAX_REF}
        showAddButton
        onPickFiles={handlePickFiles}
        onDelete={handleDeleteReference}
      />

      {/* 提示词（TextInputWithEdges，canvas 级共享，支持文本端口连入 chip） */}
      <div className={`nb-dp-prompt-wrap${isModal ? ' modal' : ''}`}>
        <TextInputWithEdges
          value={params.prompt || ''}
          onChange={(val) => onParamsChange({ prompt: val })}
          nodes={nodes}
          onChipDelete={handlePromptChipDelete}
          placeholder="描述想要生成的图像…"
          variant={isModal ? 'modal' : 'inline'}
        />
      </div>

      {/* 底栏：不传 extraOptions → model/aspect_ratio/resolution 全进单个 ParamChip */}
      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
        showParamChipIcon={false}
      />

      {/* 高级区：output_format(仅 Flash) / google_search / image_search(仅 Flash) */}
      {showAdvanced && (
        <>
          <div className="nb-dp-divider" />
          <div className="nb-dp-section-title">高级</div>
          <div className="nb-dp-advanced">
            {/* output_format 仅 Flash 档支持，Pro 不渲染（foxapi 建议 pro 不传） */}
            {!isPro && (
              <div className="nb-dp-adv-item">
                <div className="nb-dp-adv-label">输出格式</div>
                <Segmented
                  size="small"
                  value={params.output_format || ''}
                  onChange={(v) => onParamsChange({ output_format: v })}
                  options={OUTPUT_FORMAT_OPTIONS}
                />
              </div>
            )}
            <div className="nb-dp-adv-item nb-dp-adv-toggle">
              <div className="nb-dp-adv-label">Google 搜索</div>
              <Switch
                size="small"
                checked={!!params.google_search}
                onChange={(v) => onParamsChange({ google_search: v })}
              />
            </div>
            {/* image_search 仅 Flash 档支持，Pro 不渲染 */}
            {!isPro && (
              <div className="nb-dp-adv-item nb-dp-adv-toggle">
                <div className="nb-dp-adv-label">图像搜索</div>
                <Switch
                  size="small"
                  checked={!!params.image_search}
                  onChange={(v) => onParamsChange({ image_search: v })}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
