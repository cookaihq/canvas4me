/**
 * AgentBridge 接口 —— 把「外部命令中转」接进画布的传输抽象层。
 *
 * 职责:纯传输(transport-only)。一个外部中转进程在本机起 WebSocket 服务,
 * 浏览器侧主动连出去;中转把工具调用转发给浏览器,浏览器执行后把结果回传。
 * 本接口只负责「搬信封」—— 建连/断连、收命令、回结果、声明可用工具,
 * 完全不认识画布工具的语义(工具名、参数、如何落地都在执行器侧)。
 *
 * 信封约定(与中转进程严格对齐):
 *   - 浏览器 → 中转,连上后一次:  { type:'hello',  tools:[{ name, description, inputSchema }] }
 *   - 中转 → 浏览器:              { type:'call',   callId, tool, args }
 *   - 浏览器 → 中转:              { type:'result', callId, result }
 *                          或     { type:'error',  callId, error }
 *
 * 实现:
 *   - 本地实现: `impl/AgentBridge.local.js`(连 localhost WebSocket,断线重连)
 *
 * 生命周期:构造时不自动连接。执行器在「开关打开」时调用 connect();
 * 关闭或卸载时调用 disconnect()。
 *
 * @typedef {'disconnected' | 'connecting' | 'connected'} BridgeStatus
 *
 * @typedef {object} CommandEnvelope
 * @property {string} callId  本次调用的唯一 id,回结果时原样带回
 * @property {string} tool    工具名
 * @property {object} args    工具入参
 *
 * @typedef {object} ToolDeclaration
 * @property {string} name         工具名
 * @property {string} description  给外部 agent 看的说明
 * @property {object} inputSchema  入参的 JSON Schema
 *
 * @typedef {(envelope: CommandEnvelope) => void} CommandHandler
 * @typedef {(status: BridgeStatus) => void}      StatusHandler
 *
 * @typedef {object} AgentBridge
 * @property {() => void}                              connect
 *   建立连接(幂等:已连接/连接中再次调用无副作用)。断线后内部自动重连。
 * @property {() => void}                              disconnect
 *   主动断开并停止重连。状态回到 'disconnected'。
 * @property {(handler: CommandHandler) => () => void} onCommand
 *   订阅收到的命令信封,返回 unsubscribe 函数。
 * @property {(payload: { callId: string, result: any }) => void} sendResult
 *   回传成功结果。
 * @property {(payload: { callId: string, error: string }) => void} sendError
 *   回传错误(error 为字符串说明)。
 * @property {(tools: ToolDeclaration[]) => void}      declareTools
 *   发送 hello 信封声明全部可用工具。应在状态变为 'connected' 后调用。
 * @property {BridgeStatus}                            status
 *   当前连接状态(只读快照)。
 * @property {(handler: StatusHandler) => () => void}  onStatusChange
 *   订阅状态变化,返回 unsubscribe 函数。
 */

export {} // 类型描述文件
