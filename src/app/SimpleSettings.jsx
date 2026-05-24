import { useEffect, useState } from 'react'
import { Tabs, Form, Input, Button, Space, Upload, Alert, Descriptions, Table, message, Popconfirm, Divider, Empty } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { Download, Upload as UploadIcon, Eraser, Trash2, Flame, Bug } from '@/canvas/icons'
import { useSettings } from '@/platform/provider.jsx'
import { getCanvasIdFromUrl } from '@/canvas/utils/canvasUrl'
import BasicSection from '@/canvas/components/AppSettings/BasicSection'
import { useCanvasIO } from './canvasIO'
import { getErrorLog, clearErrorLog, downloadErrorLog } from '@/utils/errorReport'

const FOXAPI_USAGE_URL = 'https://api.foxapi.cc/api/usage/token/'
const FOXAPI_LOG_URL = 'https://api.foxapi.cc/api/log/token'
const QUOTA_PER_USD = 500000

function quotaToUsd(quota) {
  if (typeof quota !== 'number' || Number.isNaN(quota)) return '-'
  return `$${(quota / QUOTA_PER_USD).toFixed(2)}`
}

function formatExpiresAt(ts) {
  if (!ts || ts <= 0) return '永不过期'
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return String(ts)
  }
}

function formatTimestamp(ts) {
  if (!ts) return '-'
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return String(ts)
  }
}

/**
 * 极简设置弹窗 — 2 tab:
 *   - API Key:    foxapi.cc 的 API Key (Bearer token)
 *   - 画布数据:    导出/导入 JSON
 *
 * Settings 数据存放(全部 localStorage):
 *   globalSettings.foxapi.apiKey   — API Key tab
 *
 * 文件上传走 foxapi 临时上传(72h auto_cleanup),URL 失效时由提交链路的自愈机制
 * 自动从浏览器缓存重新上传拿新 url(详见 src/canvas/utils/urlSelfHeal.js),
 * 用户无需配置 OSS 也能像永久存储一样使用画布。
 */
export default function SimpleSettings({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('api-key')

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="设置"
      footer={null}
      width={680}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'api-key', label: 'API Key', children: <ApiKeyTab /> },
          { key: 'preferences', label: '偏好', children: <PreferencesTab /> },
          { key: 'data', label: '画布数据', children: <CanvasDataTab /> },
          { key: 'diagnostics', label: '诊断', children: <DiagnosticsTab /> },
        ]}
      />
    </Modal>
  )
}

const LOG_COLUMNS = [
  {
    title: '时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 160,
    render: formatTimestamp,
  },
  {
    title: '模型',
    dataIndex: 'model_name',
    key: 'model_name',
    onCell: () => ({ style: { wordBreak: 'break-all', whiteSpace: 'normal' } }),
  },
  {
    title: '消费',
    dataIndex: 'quota',
    key: 'quota',
    width: 90,
    render: quotaToUsd,
  },
  {
    title: '分组',
    dataIndex: 'group',
    key: 'group',
    ellipsis: true,
    render: (v) => v || '-',
  },
]

function ApiKeyTab() {
  const settings = useSettings()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [usage, setUsage] = useState(null)
  const [usageError, setUsageError] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState(null)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logsError, setLogsError] = useState('')

  useEffect(() => {
    let cancelled = false
    settings.getGlobal().then((g) => {
      if (cancelled) return
      form.setFieldsValue({ apiKey: g?.foxapi?.apiKey || '' })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [settings, form])

  const handleSave = async ({ apiKey }) => {
    setSaving(true)
    try {
      const current = await settings.getGlobal()
      await settings.updateGlobal({
        foxapi: { ...(current?.foxapi || {}), apiKey: apiKey || '' },
      })
      message.success('已保存')
    } catch (err) {
      message.error('保存失败:' + (err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const handleQueryUsage = async () => {
    const apiKey = (form.getFieldValue('apiKey') || '').trim()
    if (!apiKey) {
      message.warning('请先填入 API Key')
      return
    }
    setQuerying(true)
    setUsageError('')
    setUsage(null)
    setLogs(null)
    setLogsError('')
    setShowLogs(false)
    try {
      const resp = await fetch(FOXAPI_USAGE_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error('API Key 无效或已被禁用')
        }
        const text = await resp.text().catch(() => '')
        let msg = text
        try {
          const j = JSON.parse(text)
          msg = j?.message || j?.error?.message || text
        } catch { /* ignore */ }
        throw new Error(`查询失败 (${resp.status}): ${msg || resp.statusText}`)
      }
      const json = await resp.json()
      const data = json?.data || json
      if (!data || typeof data !== 'object') {
        throw new Error('响应格式异常')
      }
      setUsage(data)
    } catch (err) {
      setUsageError(err?.message || '网络错误')
    } finally {
      setQuerying(false)
    }
  }

  const fetchLogs = async () => {
    const apiKey = (form.getFieldValue('apiKey') || '').trim()
    if (!apiKey) {
      message.warning('请先填入 API Key')
      return
    }
    setLoadingLogs(true)
    setLogsError('')
    try {
      const resp = await fetch(FOXAPI_LOG_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error('API Key 无效或已被禁用')
        }
        const text = await resp.text().catch(() => '')
        let msg = text
        try {
          const j = JSON.parse(text)
          msg = j?.message || j?.error?.message || text
        } catch { /* ignore */ }
        throw new Error(`查询失败 (${resp.status}): ${msg || resp.statusText}`)
      }
      const json = await resp.json()
      const list = Array.isArray(json?.data) ? json.data : []
      setLogs(list)
    } catch (err) {
      setLogsError(err?.message || '网络错误')
      setLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleToggleLogs = async () => {
    if (showLogs) {
      setShowLogs(false)
      return
    }
    if (logs == null && !logsError) {
      await fetchLogs()
    }
    setShowLogs(true)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>

  return (
    <Form form={form} layout="vertical" onFinish={handleSave} autoComplete="off">
      <Alert
        type="info"
        showIcon
        message="foxapi.cc API Key"
        description="所有上游 AI 能力调用通过 foxapi.cc 转发(图像/视频/LLM 等)。请在 foxapi.cc 注册账号后获取 API Key 填入。"
        style={{ marginBottom: 16 }}
      />
      <Form.Item label="API Key" name="apiKey" rules={[{ required: false }]}>
        <Input.Password placeholder="sk-..." autoComplete="off" />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
          <Button onClick={handleQueryUsage} loading={querying}>查询用量</Button>
        </Space>
      </Form.Item>
      {usageError && (
        <Alert
          type="error"
          showIcon
          message={usageError}
          style={{ marginTop: 8 }}
          closable
          onClose={() => setUsageError('')}
        />
      )}
      {usage && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: 16 }}>
              {usage.name ? `Token: ${usage.name}` : '用量信息'}
            </strong>
            <Button size="small" onClick={handleToggleLogs} loading={loadingLogs}>
              {showLogs ? '概览' : '明细'}
            </Button>
          </div>
          {logsError && showLogs && (
            <Alert
              type="error"
              showIcon
              message={logsError}
              style={{ marginBottom: 8 }}
              closable
              onClose={() => setLogsError('')}
            />
          )}
          {showLogs ? (
            <Table
              size="small"
              rowKey="id"
              columns={LOG_COLUMNS}
              dataSource={logs || []}
              pagination={false}
              scroll={{ y: 320 }}
              loading={loadingLogs}
              locale={{ emptyText: '暂无明细' }}
            />
          ) : (
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="总额度">{quotaToUsd(usage.total_granted)}</Descriptions.Item>
              <Descriptions.Item label="已用">{quotaToUsd(usage.total_used)}</Descriptions.Item>
              <Descriptions.Item label="剩余">{quotaToUsd(usage.total_available)}</Descriptions.Item>
              <Descriptions.Item label="无限额度">{usage.unlimited_quota ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="到期时间">{formatExpiresAt(usage.expires_at)}</Descriptions.Item>
            </Descriptions>
          )}
        </div>
      )}
    </Form>
  )
}

function PreferencesTab() {
  const settings = useSettings()
  const [form] = Form.useForm()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const c = await settings.getApp('ai-canvas')
        if (cancelled) return
        setConfig(c || {})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const off = settings.onChange?.(load)
    return () => {
      cancelled = true
      off?.()
    }
  }, [settings])

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>

  return (
    <Form form={form} layout="vertical" autoComplete="off">
      <BasicSection form={form} config={config} />
    </Form>
  )
}

function CanvasDataTab() {
  const { exportCurrentCanvas, importCanvasFromJson } = useCanvasIO()
  const canvasId = getCanvasIdFromUrl()

  const clearCapabilityDefaults = () => {
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('ai-canvas:last-capability:') || k.startsWith('ai-canvas:last-mode:'))) {
          keys.push(k)
        }
      }
      keys.forEach(k => localStorage.removeItem(k))
      message.success(`已清空 ${keys.length} 条能力默认值缓存,刷新页面后 .env 默认值生效`)
    } catch (err) {
      message.error('清空失败: ' + (err?.message || '未知错误'))
    }
  }

  const clearMediaCache = async () => {
    try {
      const cacheDeleted = (typeof caches !== 'undefined')
        ? await caches.delete('ai-canvas-media-v1').catch(() => false)
        : false
      const dbDeleted = await new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(false)
        const req = indexedDB.deleteDatabase('ai-canvas-cache')
        req.onsuccess = () => resolve(true)
        req.onerror = () => resolve(false)
        req.onblocked = () => resolve(false)
      })
      message.success(
        `已清空媒体缓存 (Cache: ${cacheDeleted ? '✓' : '×'} / IndexedDB: ${dbDeleted ? '✓' : '×'})`
      )
    } catch (err) {
      message.error('清空失败: ' + (err?.message || '未知错误'))
    }
  }

  const resetAllExceptApiKey = async () => {
    try {
      // 保留 globalSettings 里的 foxapi.apiKey, 其余 localStorage 全清
      // key 来源: src/impl/Settings.localStorage.js KEY_GLOBAL
      const GLOBAL_KEY = 'ai-canvas:settings:global'
      let preservedApiKey = null
      try {
        const raw = localStorage.getItem(GLOBAL_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          preservedApiKey = parsed?.foxapi?.apiKey || null
        }
      } catch { /* ignore */ }

      localStorage.clear()

      if (preservedApiKey) {
        localStorage.setItem(
          GLOBAL_KEY,
          JSON.stringify({ foxapi: { apiKey: preservedApiKey } })
        )
      }

      if (typeof caches !== 'undefined') {
        await caches.delete('ai-canvas-media-v1').catch(() => false)
      }
      if (typeof indexedDB !== 'undefined') {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase('ai-canvas-cache')
          req.onsuccess = () => resolve(true)
          req.onerror = () => resolve(false)
          req.onblocked = () => resolve(false)
        })
      }

      message.success('已重置本地状态(API Key 保留),即将刷新页面...')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      message.error('重置失败: ' + (err?.message || '未知错误'))
    }
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="画布数据导入/导出"
        description="导出当前画布为 JSON 文件用于备份/迁移(仅 nodes/edges/viewport,其它运行时字段自动忽略)。"
        style={{ marginBottom: 16 }}
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Button
          icon={<Download size={14} />}
          onClick={() => exportCurrentCanvas(canvasId)}
          disabled={!canvasId}
          block
        >
          导出当前画布为 JSON
        </Button>
        <Upload
          accept=".json"
          showUploadList={false}
          beforeUpload={(file) => {
            importCanvasFromJson(canvasId, file)
            return false
          }}
          disabled={!canvasId}
        >
          <Button icon={<UploadIcon size={14} />} disabled={!canvasId} block>
            从 JSON 导入到当前画布
          </Button>
        </Upload>
        {!canvasId && (
          <Alert type="warning" showIcon message="未检测到当前画布,请先打开/创建一个画布" />
        )}

        <Divider style={{ margin: '8px 0' }} />

        <Alert
          type="warning"
          showIcon
          message="本地缓存清理"
          description="点击下方按钮按需清空浏览器本地的缓存数据。三个按钮影响范围由轻到重,操作不可撤销。"
          style={{ marginBottom: 4 }}
        />

        <Popconfirm
          title="清空能力默认值缓存"
          description="将清除 localStorage 里上次选过的能力 / mode 记录 (ai-canvas:last-capability:* + last-mode:*)。清完后 .env 配置的默认 capability 会重新生效。API Key / 偏好 / 画布数据都不动。"
          okText="确认清空"
          cancelText="取消"
          onConfirm={clearCapabilityDefaults}
        >
          <Button icon={<Eraser size={14} />} block>
            清空能力默认值缓存
          </Button>
        </Popconfirm>

        <Popconfirm
          title="清空媒体缓存"
          description="将清除浏览器 Cache API (ai-canvas-media-v1) 和 IndexedDB (ai-canvas-cache) 里缓存的图片 / 视频。清完后访问历史画布需重新下载所有素材,首次加载会变慢。画布本身不丢。"
          okText="确认清空"
          cancelText="取消"
          onConfirm={clearMediaCache}
        >
          <Button icon={<Trash2 size={14} />} block>
            清空媒体缓存
          </Button>
        </Popconfirm>

        <Popconfirm
          title="重置全部本地状态"
          description="将清除 localStorage / Cache API / IndexedDB 全部本地数据 (API Key 自动保留)。清完后会刷新页面,所有偏好 / 缓存 / 草稿都回到初始状态。"
          okText="确认重置"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={resetAllExceptApiKey}
        >
          <Button icon={<Flame size={14} />} danger block>
            重置全部本地状态 (保留 API Key)
          </Button>
        </Popconfirm>
      </Space>
    </div>
  )
}

/**
 * 诊断 tab — 错误日志查看 + 下载
 *
 * 日志由 main.jsx 顶部装载的 installConsoleBreadcrumbs / installGlobalErrorHandlers
 * + 根 GlobalErrorBoundary 自动捕获, 落进 localStorage 环形缓冲 (最近 50 条).
 * 出 bug 时把下载的 json 丢给开发者就能复盘. 见 src/utils/errorReport.js
 */
function DiagnosticsTab() {
  const [entries, setEntries] = useState(() => getErrorLog())

  const refresh = () => setEntries(getErrorLog())

  const handleDownload = () => {
    const n = downloadErrorLog()
    if (n === 0) message.info('当前无错误日志可下载')
    else message.success(`已下载 ${n} 条错误日志`)
  }

  const handleClear = () => {
    clearErrorLog()
    refresh()
    message.success('已清空错误日志')
  }

  const handleTestError = () => {
    // 故意触发一个 unhandled rejection — 让用户能验证捕获机制是否生效
    Promise.reject(new Error('Diagnostics test error (手动触发, 用于验证日志收集)'))
    setTimeout(refresh, 50)
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="错误日志"
        description="画布运行时捕获的 React 渲染错误 / 未处理的 Promise rejection / window 级未捕获异常会自动落地到浏览器本地 (最多保留最近 50 条)。出问题时下载 json 反馈给开发者就能精准复盘。"
        style={{ marginBottom: 16 }}
      />

      <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="已记录条数">{entries.length}</Descriptions.Item>
        {entries.length > 0 && (
          <>
            <Descriptions.Item label="最近一条时间">
              {new Date(entries[entries.length - 1].ts).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="最近一条类型">
              {entries[entries.length - 1].type}
            </Descriptions.Item>
            <Descriptions.Item label="最近一条消息">
              <span style={{ wordBreak: 'break-all', color: '#cf1322' }}>
                {entries[entries.length - 1].error?.message || '(no message)'}
              </span>
            </Descriptions.Item>
          </>
        )}
      </Descriptions>

      <Space wrap>
        <Button
          type="primary"
          icon={<Download size={14} />}
          onClick={handleDownload}
          disabled={entries.length === 0}
        >
          下载错误日志 ({entries.length})
        </Button>
        <Button onClick={refresh}>刷新</Button>
        <Popconfirm
          title="清空错误日志"
          description="清空后无法恢复。如果还没下载备份请先下载。"
          okText="确认清空"
          cancelText="取消"
          onConfirm={handleClear}
          disabled={entries.length === 0}
        >
          <Button icon={<Eraser size={14} />} disabled={entries.length === 0}>
            清空
          </Button>
        </Popconfirm>
        <Button icon={<Bug size={14} />} onClick={handleTestError}>
          测试 (触发一条)
        </Button>
      </Space>

      {entries.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <Empty description="暂无错误日志" />
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <Divider style={{ margin: '8px 0' }} orientation="left" plain>
            预览 (最近 {Math.min(entries.length, 5)} 条)
          </Divider>
          <Table
            size="small"
            rowKey="id"
            columns={ERROR_LOG_COLUMNS}
            dataSource={entries.slice(-5).reverse()}
            pagination={false}
            scroll={{ y: 240 }}
            expandable={{
              expandedRowRender: renderErrorDetail,
              rowExpandable: () => true,
            }}
          />
        </div>
      )}
    </div>
  )
}

const ERROR_LOG_COLUMNS = [
  {
    title: '时间',
    dataIndex: 'ts',
    key: 'ts',
    width: 160,
    render: (v) => new Date(v).toLocaleString(),
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 120,
  },
  {
    title: '消息',
    key: 'message',
    ellipsis: true,
    render: (_, r) => r.error?.message || '(no message)',
  },
]

function renderErrorDetail(entry) {
  return (
    <pre
      style={{
        fontSize: 11,
        lineHeight: 1.5,
        maxHeight: 320,
        overflow: 'auto',
        background: '#f5f5f5',
        padding: 8,
        borderRadius: 4,
        margin: 0,
      }}
    >
      {JSON.stringify(entry, null, 2)}
    </pre>
  )
}
