// 转发状态机（运行时无关的核心）：
//   - 持有「当前 tab」槽位（只认第一个，后来者拒绝）与挂起调用表（callId → promise）。
//   - 不依赖任何具体传输：tab 只需提供 { send(str), isOpen() } 两个能力，
//     由各运行时入口（Node ws / Workers DO WebSocket）适配注入。
//
// WS 消息契约（执行器必须对上）：
//   tab → 桥（连上后一次性）： { type:'hello', tools:[ { name, description, inputSchema /* JSON Schema 对象 */ } ] }
//   桥 → tab：                 { type:'call', callId, tool, args }
//   tab → 桥：                 { type:'result', callId, result }  或  { type:'error', callId, error }

export function createRelay({ callTimeoutMs = 30_000, log = () => {}, onToolsDeclared }) {
  let tab = null
  const pending = new Map() // callId -> { resolve, reject, timer }
  let nextCallId = 1

  // 注册一个 tab。已有 tab 时返回 false（只服务第一个，后来者由调用方拒绝/关闭）。
  function attachTab(t) {
    if (tab) return false
    tab = t
    return true
  }

  // tab 断开：清掉所有挂起的调用，避免它们永远卡到超时。
  function detachTab(t) {
    if (tab !== t) return
    tab = null
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error('页面已断开'))
    }
    pending.clear()
  }

  // 处理来自 tab 的一条原始消息（hello / result / error）。
  function handleMessage(raw) {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      log('收到非 JSON 消息，忽略')
      return
    }
    const { type } = msg

    // 握手：页面声明它支持哪些工具，由运行时入口决定怎么注册。
    if (type === 'hello') {
      const tools = Array.isArray(msg.tools) ? msg.tools : []
      log(`收到 hello，声明 ${tools.length} 个工具`)
      onToolsDeclared?.(tools)
      return
    }

    // 工具调用回包。
    if (type === 'result' || type === 'error') {
      const { callId } = msg
      const entry = pending.get(callId)
      if (!entry) {
        log('收到无对应 pending 的回包，忽略 callId:', callId)
        return
      }
      pending.delete(callId)
      clearTimeout(entry.timer)
      if (type === 'result') {
        entry.resolve(msg.result)
      } else {
        entry.reject(new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)))
      }
      return
    }

    log('收到未知 type，忽略:', type)
  }

  // 把一次工具调用转发给 tab，返回 Promise。
  function callTab(tool, args) {
    return new Promise((resolve, reject) => {
      if (!tab || !tab.isOpen()) {
        reject(new Error('没有页面连接到桥（端口 7777）'))
        return
      }
      const callId = nextCallId++
      const timer = setTimeout(() => {
        pending.delete(callId)
        reject(new Error(`工具 ${tool} 调用超时（${callTimeoutMs}ms）`))
      }, callTimeoutMs)
      pending.set(callId, { resolve, reject, timer })
      try {
        tab.send(JSON.stringify({ type: 'call', callId, tool, args }))
      } catch (err) {
        pending.delete(callId)
        clearTimeout(timer)
        reject(err)
      }
    })
  }

  return { attachTab, detachTab, handleMessage, callTab, hasTab: () => Boolean(tab) }
}
