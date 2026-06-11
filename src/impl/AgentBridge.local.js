/**
 * AgentBridge 本地实现 —— 连本机 WebSocket 中转,断线重连。
 * 实现 src/platform/interfaces/AgentBridge.js 契约(纯传输,只搬信封)。
 *
 * 行为:
 *   - connect(): 主动连 ws://localhost:7777;关闭/出错后延迟 1500ms 重连。
 *   - disconnect(): 主动断开并停止重连,状态回 'disconnected'。
 *   - 收到 { type:'call' } 信封 → 广播给 onCommand 订阅者。
 *   - sendResult / sendError / declareTools → 往 socket 发对应信封(未连上则丢弃)。
 *   - status + onStatusChange:对外暴露连接状态及其变化。
 *
 * 构造时不自动连接 —— 由执行器在开关打开时调用 connect()。
 */

const WS_URL = 'ws://localhost:7777'
const RECONNECT_DELAY_MS = 1500

export function createAgentBridgeLocal({ url = WS_URL } = {}) {
  let ws = null
  let reconnectTimer = null
  let stopped = true // 未 connect 前视为已停止,disconnect 后也回到 true
  let status = 'disconnected'

  const commandListeners = new Set()
  const statusListeners = new Set()

  function setStatus(next) {
    if (status === next) return
    status = next
    for (const fn of statusListeners) {
      try { fn(status) } catch { /* ignore listener errors */ }
    }
  }

  function emitCommand(envelope) {
    for (const fn of commandListeners) {
      try { fn(envelope) } catch { /* ignore listener errors */ }
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function open() {
    if (stopped) return
    setStatus('connecting')
    ws = new WebSocket(url)

    ws.onopen = () => {
      if (stopped) {
        try { ws.close() } catch { /* noop */ }
        return
      }
      setStatus('connected')
    }

    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (!msg || msg.type !== 'call') return
      const { callId, tool, args } = msg
      emitCommand({ callId, tool, args })
    }

    ws.onclose = () => {
      setStatus('disconnected')
      if (stopped) return
      // 中转可能比画布晚起 / 中途重启 → 延迟重连。
      reconnectTimer = setTimeout(open, RECONNECT_DELAY_MS)
    }

    ws.onerror = () => {
      // 出错也会触发 onclose,重连逻辑统一在 onclose 里收口。
      try { ws.close() } catch { /* noop */ }
    }
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(payload))
    } catch { /* 发送失败忽略,下一次重连后重新声明/回传 */ }
  }

  /** @type {import('@/platform/interfaces/AgentBridge').AgentBridge} */
  return {
    connect() {
      if (!stopped) return // 已在连接 / 已连上,幂等
      stopped = false
      open()
    },
    disconnect() {
      stopped = true
      clearReconnect()
      if (ws) {
        ws.onclose = null // 阻断重连
        ws.onerror = null
        try { ws.close() } catch { /* noop */ }
        ws = null
      }
      setStatus('disconnected')
    },
    onCommand(handler) {
      commandListeners.add(handler)
      return () => commandListeners.delete(handler)
    },
    sendResult({ callId, result }) {
      send({ type: 'result', callId, result })
    },
    sendError({ callId, error }) {
      send({ type: 'error', callId, error })
    },
    declareTools(tools) {
      send({ type: 'hello', tools })
    },
    get status() {
      return status
    },
    onStatusChange(handler) {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    },
  }
}

// 默认入口实例;测试 / 其他入口按需调 createAgentBridgeLocal() 另起一个。
/** @type {import('@/platform/interfaces/AgentBridge').AgentBridge} */
export const agentBridgeLocal = createAgentBridgeLocal()
