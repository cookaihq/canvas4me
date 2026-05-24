/**
 * 节点 data debug 渲染块 — 复用于 OutputPanel 顶部 + §15 NodeSelectionToolbar 弹出的 Modal。
 *
 * 接 1 个 node, 展示两个 Collapse 项:
 *   - node.data (除 lastPollingItem / lastPolledAt 外)
 *   - 最近一次轮询返回 (TaskStatusItem) + 轮询时间
 *
 * 也提供按"字段子集"渲染的 NodeDataPickBlock,给 §15.5 折叠形态分两块时用。
 */
import { Collapse, Button, message } from 'antd'
import { Copy } from '@/canvas/icons'

export default function NodeDataDebugBlock({ node, defaultOpenAll = false, hidePollingItem = false }) {
  const { lastPollingItem, lastPolledAt, ...rest } = node?.data || {}
  const polledAtLabel = lastPolledAt ? formatPolledAt(lastPolledAt) : null
  const defaultActive = defaultOpenAll ? ['node-data', 'polling-item'] : []
  const items = [
    {
      key: 'node-data',
      label: 'node.data',
      children: <DebugPre value={rest} />,
    },
  ]
  if (!hidePollingItem) {
    items.push({
      key: 'polling-item',
      label: '最近一次轮询返回 (TaskStatusItem)',
      children: lastPollingItem ? (
        <>
          {polledAtLabel && (
            <div style={{ color: 'var(--ac-text-muted)', fontSize: 11, marginBottom: 4 }}>
              最近轮询时间：{polledAtLabel}
            </div>
          )}
          <DebugPre value={lastPollingItem} />
        </>
      ) : (
        <div style={{ color: 'var(--ac-text-muted)' }}>（本节点尚未收到轮询结果）</div>
      ),
    })
  }
  return (
    <Collapse
      size="small"
      defaultActiveKey={defaultActive}
      items={items}
    />
  )
}

/**
 * 按字段子集渲染 — §15.5 折叠形态分块时使用。
 * keys: 要展示的字段名数组(如 ['capability', 'mode', 'modeParams', 'runStatus'])
 */
export function NodeDataPickBlock({ data, keys, emptyHint = '（无数据）', defaultOpen = true }) {
  const pick = keys.reduce((acc, k) => {
    if (data && Object.prototype.hasOwnProperty.call(data, k)) acc[k] = data[k]
    return acc
  }, {})
  const isEmpty = Object.keys(pick).length === 0
  return (
    <Collapse
      size="small"
      defaultActiveKey={defaultOpen ? ['pick'] : []}
      items={[
        {
          key: 'pick',
          label: `字段子集（${keys.length} 个声明）`,
          children: isEmpty
            ? <div style={{ color: 'var(--ac-text-muted)' }}>{emptyHint}</div>
            : <DebugPre value={pick} />,
        },
      ]}
    />
  )
}

export function DebugPre({ value }) {
  const json = safeStringify(value)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      message.success('已复制')
    } catch {
      message.error('复制失败')
    }
  }
  return (
    <div style={{ position: 'relative' }}>
      <Button
        size="small"
        type="text"
        icon={<Copy size={13} />}
        onClick={handleCopy}
        style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
      />
      <pre
        style={{
          margin: 0,
          padding: 8,
          paddingRight: 32,
          fontSize: 11,
          lineHeight: 1.4,
          maxHeight: 400,
          overflow: 'auto',
          background: 'var(--ac-bg-muted, #f5f5f5)',
          borderRadius: 4,
        }}
      >
        {json}
      </pre>
    </div>
  )
}

function formatPolledAt(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const ago = Math.max(0, Math.round((Date.now() - ts) / 1000))
  return `${local}（${ago}s 前）`
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
