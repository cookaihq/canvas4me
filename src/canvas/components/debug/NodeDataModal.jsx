/**
 * 节点 data 查看 Modal — 见 docs/reference/ux-spec.md §15.5
 *
 * 分两块展示:
 *   - capability 节点(分离形态): 能力节点 data + 关联下游 output 节点 data
 *   - capability 节点(折叠形态): 能力节点 data + 下游 output 节点 data
 *     (折叠形态下 outputNode 的 data 被渲染层过滤但仍存在, polling 结果 / content
 *      仍写到 outputNode.data 上, 而非合并回能力节点)
 *   - content / 其他: 只展示「当前节点」一块
 *
 * 复用 NodeDataDebugBlock(整份 node.data + lastPollingItem) — 折叠形态下产物侧
 * 直接展示下游 output 节点的整份 data,不再用子集 pick。
 */
import { useMemo } from 'react'
import { Modal } from '@/canvas/components/AntdWrappers'
import { isFoldedCapability, isOutputNodeType } from '@/canvas/registry/nodeTypes'
import NodeDataDebugBlock from './NodeDataDebugBlock'

export default function NodeDataModal({ open, onClose, node, allNodes, allEdges }) {
  const blocks = useMemo(() => buildBlocks(node, allNodes, allEdges), [node, allNodes, allEdges])
  if (!node) return null
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`节点数据 · ${node.data?.name || node.id}`}
      footer={null}
      width={720}
      style={{ top: 40 }}
      zIndex={2000}
      destroyOnClose
    >
      {blocks.hint && (
        <div className="node-data-modal-hint">{blocks.hint}</div>
      )}
      {blocks.sections.map(section => (
        <div key={section.key} className="node-data-modal-section">
          <div className="node-data-modal-section-title">{section.title}</div>
          {section.kind === 'full' && (
            <NodeDataDebugBlock
              node={section.node}
              defaultOpenAll
              hidePollingItem={section.hidePollingItem}
            />
          )}
          {section.kind === 'empty' && (
            <div className="node-data-modal-empty">{section.hint || '（无数据）'}</div>
          )}
        </div>
      ))}
    </Modal>
  )
}

function buildBlocks(node, allNodes, allEdges) {
  if (!node) return { sections: [], hint: null }

  const data = node.data || {}
  const isCapability = node.type === 'capability'
  const isOutput = isOutputNodeType(node.type)
  const isContent = !isCapability && !isOutput

  // content 节点 / 输出节点: 只展示一块
  if (isContent || isOutput) {
    return {
      hint: null,
      sections: [
        { key: 'self', title: '当前节点 data', kind: 'full', node },
      ],
    }
  }

  // capability 节点
  const folded = !!data.capability && isFoldedCapability(data.capability)
  const downstreamOutput = findDownstreamOutput(node, allNodes, allEdges)

  if (folded) {
    // 折叠形态: 能力节点 data + 下游 output 节点 data
    // 下游 output 虽然渲染被过滤掉但仍存在于 store, polling/content 都写在它身上.
    // 能力侧不会收到轮询结果, 隐藏 polling 子块避免冗余 (lastPollingItem 在 output 侧展示).
    return {
      hint: '该节点为折叠形态(form: \'folded\'),下游 output 节点在数据层存在但渲染被过滤。产物 content / runStatus / lastPollingItem 仍写在 output 节点的 data 上。',
      sections: [
        { key: 'capability', title: '能力节点 data', kind: 'full', node, hidePollingItem: true },
        downstreamOutput
          ? { key: 'output', title: '输出节点 data(产物侧)', kind: 'full', node: downstreamOutput }
          : { key: 'output-empty', title: '输出节点 data(产物侧)', kind: 'empty', hint: '（折叠能力节点尚未运行, 下游 output 节点未创建）' },
      ],
    }
  }

  // 分离形态: 找下游第一个 output 节点
  return {
    hint: null,
    sections: [
      { key: 'capability', title: '能力节点 data', kind: 'full', node },
      downstreamOutput
        ? { key: 'output', title: '输出节点 data', kind: 'full', node: downstreamOutput }
        : { key: 'output-empty', title: '输出节点 data', kind: 'empty', hint: '（未连接下游 output 节点）' },
    ],
  }
}

function findDownstreamOutput(node, allNodes, allEdges) {
  if (!node || !Array.isArray(allEdges) || !Array.isArray(allNodes)) return null
  const nodeById = new Map(allNodes.map(n => [n.id, n]))
  for (const e of allEdges) {
    if (e.source !== node.id) continue
    const target = nodeById.get(e.target)
    if (target && isOutputNodeType(target.type)) return target
  }
  return null
}
