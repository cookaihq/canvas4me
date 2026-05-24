import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { saveCanvas } from '../utils/canvasStorage'
import { useCanvasStore } from '@/platform/provider.jsx'
import { onEvent } from '@/utils/eventBus'

const REQUEST_SAVE_EVENT = 'canvas:request-immediate-save'

const DEBOUNCE_MS = 2000

/**
 * 自动保存 hook
 *
 * 数据来源是画布内部 store(单一数据源,经 useReactFlow 实时读),hook 不再接收
 * nodes/edges/getViewport 入参,存盘时用 rf.getNodes() / rf.getEdges() / rf.getViewport()
 * 取"那一刻"的完整状态。
 *
 * - 拖拽结束 / 改名改色等 commit 后由外部调用 triggerSave() 立即保存
 * - 节点/边变化(onNodesChange / onEdgesChange)时外部调 scheduleSave() 走 2s debounce
 * - 面板 config 变更时调用 markDirty() 触发 debounce
 * - 仅在 isEditing=true 且有 canvasId 时保存
 *
 * @param {{ canvasId, isEditing, onLockLost }} opts
 * @returns {{ triggerSave, scheduleSave, markDirty, isSaving }}
 */
export default function useAutoSave({ canvasId, isEditing, onLockLost }) {
  const rf = useReactFlow()
  const canvasStore = useCanvasStore()
  const [isSaving, setIsSaving] = useState(false)
  const timerRef = useRef(null)
  const isEditingRef = useRef(isEditing)
  const canvasIdRef = useRef(canvasId)

  // 把外部传进来的"每渲染都可能新引用"的回调兜到 ref 里, 让下面的
  // doSave/triggerSave/scheduleSave/markDirty 全部保持稳定引用. 不然 onLockLost 这种
  // 内联箭头 → doSave 链 → onNodeDragStop (ReactFlow tracked field) 整条都
  // 每渲染换引用, 会让 StoreUpdater 的 useLayoutEffect 反复 setState, 配合 React
  // 嵌套更新检测就能撞出 "Maximum update depth exceeded".
  const onLockLostRef = useRef(onLockLost)
  onLockLostRef.current = onLockLost

  useEffect(() => { isEditingRef.current = isEditing }, [isEditing])
  useEffect(() => { canvasIdRef.current = canvasId }, [canvasId])

  // doSave 只依赖稳定的 canvasStore + rf + ref, 所以 callback 引用 mount 后永不变.
  const doSave = useCallback(async () => {
    if (!isEditingRef.current || !canvasIdRef.current) return
    const viewport = rf.getViewport ? rf.getViewport() : { x: 0, y: 0, zoom: 1 }
    setIsSaving(true)
    try {
      await saveCanvas(canvasStore, canvasIdRef.current, {
        nodes: rf.getNodes(),
        edges: rf.getEdges(),
        viewport,
      })
      console.log('[AutoSave] 保存成功')
    } catch (err) {
      if (err.isLockLost) {
        console.warn('[AutoSave] 编辑锁已失效')
        onLockLostRef.current?.()
      } else {
        console.error('[AutoSave] 保存失败:', err.message)
      }
    } finally {
      setIsSaving(false)
    }
  }, [canvasStore, rf])

  // 立即保存（拖拽结束 / commit 后调用）
  const triggerSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    doSave()
  }, [doSave])

  // debounce 保存（挂到 onNodesChange / onEdgesChange，加载期由调用方 guard 屏蔽）
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      doSave()
    }, DEBOUNCE_MS)
  }, [doSave])

  // 手动标记脏数据（面板 config 变更）
  const markDirty = useCallback(() => {
    scheduleSave()
  }, [scheduleSave])

  // 清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // 监听"立即保存"事件 (如节点改名、改色、改 text 等 commit 后调用),
  // 跳过 debounce 直接保存, 避免用户编辑后 < 2s 刷新丢数据
  useEffect(() => {
    const unsubscribe = onEvent(REQUEST_SAVE_EVENT, () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      doSave()
    })
    return unsubscribe
  }, [doSave])

  return { triggerSave, scheduleSave, markDirty, isSaving }
}
