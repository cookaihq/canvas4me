import { useState, useEffect, useCallback, useMemo } from 'react'
import { List, Button, Input, Popconfirm, message, Empty, Spin, Checkbox, Dropdown, Tooltip } from 'antd'
import { Drawer } from '@/canvas/components/AntdWrappers'
import { Plus, Trash2, Pencil, Check, X, RefreshCw, ArrowUpDown } from '@/canvas/icons'
import { useCanvasStore } from '@/platform/provider.jsx'

const MINE_ONLY_LS_KEY = 'ai-canvas.canvasManager.mineOnly'
const SORT_BY_LS_KEY = 'ai-canvas.canvasManager.sortBy'

const SORT_OPTIONS = [
  { key: 'updated_at', label: '按编辑时间' },
  { key: 'created_at', label: '按创建时间' },
]

function readMineOnlyDefault() {
  try {
    const v = localStorage.getItem(MINE_ONLY_LS_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

function readSortByDefault() {
  try {
    const v = localStorage.getItem(SORT_BY_LS_KEY)
    return v === 'created_at' ? 'created_at' : 'updated_at'
  } catch {
    return 'updated_at'
  }
}

/**
 * 画布管理抽屉
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   currentCanvasId: string,
 *   onSwitchCanvas: (canvasId: string) => void,
 *   onCreateCanvas: (canvas: object) => void,
 *   onRenameCanvas?: (canvasId: string, name: string) => void,
 * }} props
 */
export default function CanvasManager({
  open,
  onClose,
  currentCanvasId,
  onSwitchCanvas,
  onCreateCanvas,
  onRenameCanvas,
}) {
  const canvasStore = useCanvasStore()
  const supportsScopeMine = !!canvasStore.capabilities?.scopeMine
  const [canvases, setCanvases] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [mineOnly, setMineOnly] = useState(() =>
    supportsScopeMine ? readMineOnlyDefault() : false
  )
  const [sortBy, setSortBy] = useState(readSortByDefault)

  const handleMineOnlyChange = (e) => {
    const v = e.target.checked
    setMineOnly(v)
    try { localStorage.setItem(MINE_ONLY_LS_KEY, v ? '1' : '0') } catch { /* ignore */ }
  }

  const handleSortChange = (key) => {
    setSortBy(key)
    try { localStorage.setItem(SORT_BY_LS_KEY, key) } catch { /* ignore */ }
  }

  // 客户端排序(后端 list 接口未支持 sort 参数;当前也未启用分页,客户端排是安全的)
  const sortedCanvases = useMemo(() => {
    const arr = canvases.slice()
    arr.sort((a, b) => (b?.[sortBy] || '').localeCompare(a?.[sortBy] || ''))
    return arr
  }, [canvases, sortBy])

  const fetchCanvases = useCallback(async () => {
    setLoading(true)
    try {
      const opts = supportsScopeMine ? { scope: mineOnly ? 'mine' : 'team' } : undefined
      const resp = await canvasStore.list(opts)
      // resp 可能是数组或 { items: [...] } 格式
      const list = Array.isArray(resp) ? resp : (resp?.items || resp?.list || [])
      setCanvases(list)
    } catch (err) {
      message.error('加载画布列表失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [canvasStore, supportsScopeMine, mineOnly])

  useEffect(() => {
    if (open) fetchCanvases()
  }, [open, fetchCanvases])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      message.warning('请输入画布名称')
      return
    }
    setCreating(true)
    try {
      const resp = await canvasStore.create(name)
      message.success('创建成功')
      setNewName('')
      onCreateCanvas?.(resp)
      fetchCanvases()
      onClose?.()
    } catch (err) {
      message.error('创建失败: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await canvasStore.delete(id)
      message.success('已删除')
      setCanvases((prev) => prev.filter((c) => c.id !== id))
      if (id === currentCanvasId) {
        // 删除当前画布后，切到列表中的第一个
        const remaining = canvases.filter((c) => c.id !== id)
        if (remaining.length > 0) {
          onSwitchCanvas(remaining[0].id)
        }
      }
    } catch (err) {
      message.error('删除失败: ' + err.message)
    }
  }

  const handleRename = async (id) => {
    const name = renameValue.trim()
    if (!name) {
      setRenamingId(null)
      return
    }
    try {
      await canvasStore.rename(id, name)
      setCanvases((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name } : c))
      )
      onRenameCanvas?.(id, name)
      message.success('已重命名')
    } catch (err) {
      message.error('重命名失败: ' + err.message)
    }
    setRenamingId(null)
  }

  const startRename = (canvas) => {
    setRenamingId(canvas.id)
    setRenameValue(canvas.name)
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Drawer
      title="画布管理"
      open={open}
      onClose={onClose}
      placement="right"
      width={320}
      styles={{ body: { padding: '12px 16px' } }}
    >
      {/* 新建画布 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="输入画布名称"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreate}
          size="small"
        />
        <Button
          type="primary"
          size="small"
          icon={<Plus size={14} />}
          loading={creating}
          onClick={handleCreate}
        >
          新建
        </Button>
      </div>

      {/* 工具栏:范围过滤 + 刷新/排序 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          minHeight: 24,
        }}
      >
        {supportsScopeMine ? (
          <Checkbox checked={mineOnly} onChange={handleMineOnlyChange}>
            <span style={{ fontSize: 12 }}>只看我创建的</span>
          </Checkbox>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip title="刷新">
            <RefreshCw
              size={14}
              style={{
                cursor: loading ? 'not-allowed' : 'pointer',
                color: '#595959',
                opacity: loading ? 0.5 : 1,
              }}
              onClick={() => { if (!loading) fetchCanvases() }}
            />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              selectable: true,
              selectedKeys: [sortBy],
              items: SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label })),
              onClick: ({ key }) => handleSortChange(key),
            }}
          >
            <Tooltip title="排序">
              <ArrowUpDown
                size={14}
                style={{ cursor: 'pointer', color: '#595959' }}
              />
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      {/* 画布列表 */}
      <Spin spinning={loading}>
        {sortedCanvases.length === 0 && !loading ? (
          <Empty description="暂无画布" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={sortedCanvases}
            size="small"
            renderItem={(canvas) => {
              const isActive = canvas.id === currentCanvasId
              const isRenaming = renamingId === canvas.id
              return (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background: isActive ? '#e6f7ff' : undefined,
                    borderRadius: 6,
                    padding: '8px 10px',
                    marginBottom: 4,
                  }}
                  onClick={() => {
                    if (!isRenaming && canvas.id !== currentCanvasId) {
                      onSwitchCanvas(canvas.id)
                      onClose()
                    }
                  }}
                  actions={
                    isRenaming
                      ? [
                          <Check
                            key="ok"
                            size={14}
                            style={{ color: '#2ECC71', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRename(canvas.id)
                            }}
                          />,
                          <X
                            key="cancel"
                            size={14}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingId(null)
                            }}
                          />,
                        ]
                      : [
                          <Pencil
                            key="edit"
                            size={14}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              startRename(canvas)
                            }}
                          />,
                          <Popconfirm
                            key="del"
                            title="确定删除此画布？"
                            onConfirm={(e) => {
                              e?.stopPropagation()
                              handleDelete(canvas.id)
                            }}
                            onCancel={(e) => e?.stopPropagation()}
                          >
                            <Trash2
                              size={14}
                              style={{ color: '#ff4d4f', cursor: 'pointer' }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>,
                        ]
                  }
                >
                  <List.Item.Meta
                    title={
                      isRenaming ? (
                        <Input
                          size="small"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onPressEnter={() => handleRename(canvas.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: isActive ? 600 : 400 }}>
                          {canvas.name}
                        </span>
                      )
                    }
                    description={
                      <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                        {canvas.node_count != null && `${canvas.node_count} 个节点 · `}
                        {formatTime(canvas.created_at)}
                      </span>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Spin>
    </Drawer>
  )
}
