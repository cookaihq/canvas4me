import { useEffect, useRef } from 'react'
import { useAgentBridge, useSettings, useCanvasStore } from '@/platform/provider'
import { buildToolDeclarations, dispatch } from './tools'

/**
 * 把「外部命令中转」接进画布 facade 的执行器 hook —— 画布侧「监听外部命令」的唯一入口。
 *
 * 流程(谁干什么活):
 *   1. 开关读自 settings.getGlobal() 的 `agentBridge.enabled`(缺省 false)。
 *      关 → 什么都不做(不建连接);开 → bridge.connect()。
 *   2. 连上后(status='connected')→ bridge.declareTools(全部工具声明)发 hello。
 *   3. 收到命令信封 → dispatch(tool, args, ctx) → 成功回 result、抛错回 error。
 *   4. 关闭开关 / 组件卸载 → 退订 + 断开连接。
 *
 * hooks 规则:本 hook 始终被调用(不放在条件分支里);开关判定写在 effect 内部。
 * 传输层缺失(agentBridge 为 null/undefined)时安全跳过 —— 无该实现的装配也能正常运行。
 *
 * ctx-ref:工具 handler 是在 WebSocket 消息到达时异步触发的,需要拿到 React 渲染里的
 * 最新值。因此把 ctx 存进每次渲染都刷新的 ref,dispatch 读 ctxRef.current。
 * 后续迭代只需往 ctx 里加字段(运行能力 / 分组 / 视口 / 设置等)+ 新增工具文件,
 * 不必改动本执行器的接线。
 *
 * ctx 字段:
 *   - facade        画布读/写访问层(节点/边的读取与写入,所有写经此)
 *   - canvasStore   画布项目存取层(list / create / get),由 platform 注入
 *   - switchCanvas  把在线画布切到某项目 id(经 deps.switchCanvasRef 透传宿主回调)
 *   - getProjectMeta 取当前项目 { id, name }(经 deps.projectMetaRef 透传)
 *   - isEditing     调用时求值:当前是否可编辑(经 deps.editingRef 透传;缺省视为可编辑)
 *   - run           触发某节点运行(取号式:resolve 于上游提交完成,不等产物;经 deps.runNodeRef 透传)
 *   - viewport()    调用时求值:视口操作集合(平移/居中/取空位,view state,不经 facade;经 deps.viewportRef 透传)
 *   - groupActions() 调用时求值:成组/解组(经 deps.groupActionsRef 透传)
 *   - connect       连线(复用画布标准 onConnect:写边 + portConnections + 折叠源代理;经 deps.connectRef 透传)
 *   - isValidConnection 连线合法性校验(复用画布标准校验;经 deps.isValidConnectionRef 透传)
 *
 * 切换/项目元信息/编辑态/运行/视口/分组/连线用 ref 透传:宿主里这些值定义在本 hook 调用点之后,
 * 直接传值会有顺序问题;用 ref 让 handler 在命令到达时再读 .current 拿到最新值。
 *
 * @param {ReturnType<import('@/canvas/state/canvasFacade').useCanvasFacade>} facade
 * @param {object} [deps]
 * @param {{ current: ((id: string) => Promise<void>) | null }} [deps.switchCanvasRef] 切换在线画布的宿主回调 ref
 * @param {{ current: (() => { id: string, name: string }) | null }} [deps.projectMetaRef] 取当前项目元信息的 ref
 * @param {{ current: boolean }} [deps.editingRef] 当前是否可编辑的 ref
 * @param {{ current: ((nodeId: string) => Promise<any>) | null }} [deps.runNodeRef] 运行节点的宿主回调 ref
 * @param {{ current: object | null }} [deps.viewportRef] 视口操作集合 ref(getViewportCenter/findFreeSpot/centerNodeAt/panCanvasTo/panToNodesBounds)
 * @param {{ current: { createGroup: Function, ungroup: Function } | null }} [deps.groupActionsRef] 成组/解组操作 ref
 * @param {{ current: ((connection: object) => void) | null }} [deps.connectRef] 标准连线回调 ref
 * @param {{ current: ((connection: object) => boolean) | null }} [deps.isValidConnectionRef] 连线校验回调 ref
 */
export default function useAgentExecutor(facade, deps = {}) {
  const agentBridge = useAgentBridge()
  const settings = useSettings()
  const canvasStore = useCanvasStore()

  const { switchCanvasRef, projectMetaRef, editingRef, runNodeRef, viewportRef, groupActionsRef, connectRef, isValidConnectionRef } = deps

  // ── ctx-ref:每次渲染刷新,保证异步 handler 读到最新值 ──
  // 后续迭代往这个对象加字段(run / group / reactflow ...),无需改执行器。
  // switchCanvas / getProjectMeta 包成稳定箭头:命令到达时再读对应 ref.current,
  // 避免宿主里这些回调定义在本 hook 之后造成的顺序问题。
  const ctxRef = useRef(null)
  ctxRef.current = {
    facade,
    canvasStore,
    switchCanvas: (id) => {
      const fn = switchCanvasRef?.current
      if (typeof fn !== 'function') throw new Error('切换画布能力未接通')
      return fn(id)
    },
    getProjectMeta: () => projectMetaRef?.current?.() ?? null,
    // 调用时求值(非渲染快照):命令到达那一刻再读 editingRef.current,避免拿到陈旧编辑态。
    isEditing: () => editingRef?.current !== false,
    run: (nodeId) => {
      const fn = runNodeRef?.current
      if (typeof fn !== 'function') throw new Error('运行能力未接通')
      return fn(nodeId)
    },
    // viewport / groupActions 同样做成「调用时求值」闭包(与 run/connect 一致):命令到达时
    // 再读 .current,避免渲染快照在首挂载时为 null 而拿到陈旧值(add_node 自动布局会因此漏到 (0,0))。
    viewport: () => viewportRef?.current ?? null,
    groupActions: () => groupActionsRef?.current ?? null,
    connect: (connection) => {
      const fn = connectRef?.current
      if (typeof fn !== 'function') throw new Error('连线能力未接通')
      return fn(connection)
    },
    isValidConnection: (connection) => isValidConnectionRef?.current?.(connection) ?? true,
  }

  useEffect(() => {
    // 传输层未装配 → 直接跳过(保持 hook 始终调用,仅 effect 内 early return)。
    if (!agentBridge) return

    let wired = false
    let unsubStatus = null
    let unsubCommand = null

    // 状态变 connected 时声明全部工具(发 hello)。
    const handleStatus = (status) => {
      if (status === 'connected') {
        agentBridge.declareTools(buildToolDeclarations())
      }
    }

    // 收到命令 → 异步派发 → 回结果 / 回错误。
    const handleCommand = async ({ callId, tool, args }) => {
      try {
        const result = await dispatch(tool, args, ctxRef.current)
        agentBridge.sendResult({ callId, result })
      } catch (e) {
        agentBridge.sendError({ callId, error: String(e?.message || e) })
      }
    }

    const wireUp = () => {
      if (wired) return
      wired = true
      // 先订 onStatusChange 再 connect:连上(status='connected')由 handleStatus 发 hello。
      // 传输是 WebSocket,onopen 必为异步,connect() 同步返回时尚未 connected,故订阅一定赶得上首个事件。
      unsubStatus = agentBridge.onStatusChange(handleStatus)
      unsubCommand = agentBridge.onCommand(handleCommand)
      agentBridge.connect()
    }

    const tearDown = () => {
      if (!wired) return
      wired = false
      if (unsubStatus) { unsubStatus(); unsubStatus = null }
      if (unsubCommand) { unsubCommand(); unsubCommand = null }
      agentBridge.disconnect()
    }

    // 开关变化时:开 → wireUp,关 → tearDown(wired 标志保证两者各自幂等)。
    // 注意:本函数不防 getGlobal() 乱序 resolve —— 仅在 getGlobal() 同步(localStorage)时安全;
    // 真正异步的实现需加序号守门,避免旧值的 then 后到覆盖新值。
    const applyEnabled = (next) => {
      if (next) wireUp()
      else tearDown()
    }

    // 挂载时读一次开关(e2e 会改 localStorage 后整页 reload,挂载读已足够)。
    let cancelled = false
    settings.getGlobal().then((g) => {
      if (cancelled) return
      applyEnabled(g?.agentBridge?.enabled)
    })

    // 同时订阅设置变更,使开关在不刷新页面时也能即时生效。
    const unsubSettings = settings.onChange((payload) => {
      if (payload?.scope && payload.scope !== 'global') return
      settings.getGlobal().then((g) => {
        if (cancelled) return
        applyEnabled(g?.agentBridge?.enabled)
      })
    })

    return () => {
      cancelled = true
      unsubSettings()
      tearDown()
    }
  }, [agentBridge, settings])
}
