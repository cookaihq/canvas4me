/**
 * Tab 会话与长链接请求管理工具
 *
 * 用于管理当前 Tab 的长链接请求状态，支持：
 * - Tab ID 管理（每个 Tab 独立标识）
 * - 进行中请求的注册/取消注册
 * - 页面刷新/关闭时的提醒
 * - 页面加载时清理悬空请求
 *
 * 适用场景：
 * - 异步任务创建（如语音合成、视频生成）
 * - 大文件上传
 * - 任何需要等待响应的长链接请求
 */

// ==================== 常量 ====================

const TAB_ID_KEY = 'ai-tools-tab-id';
const PENDING_REQUESTS_KEY = 'ai-tools-pending-requests';
const PENDING_REQUEST_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 小时——超过视作僵尸

// ==================== Tab ID 管理 ====================

/**
 * 生成唯一的 Tab ID
 * @returns {string}
 */
function generateTabId() {
  return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取当前 Tab ID（不存在则自动创建）
 * @returns {string}
 */
export function getTabId() {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = generateTabId();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
    console.log('[TabSession] 生成新的 Tab ID:', tabId);
  }
  return tabId;
}

// ==================== 请求状态管理 ====================

/**
 * 获取当前 Tab 的所有进行中请求（内部使用）
 * 读取时自动剔除超过 2 小时的过期记录并写回 sessionStorage。
 * @returns {{ map: Map<string, object>, pruned: boolean }}
 */
function getPendingRequestsMap() {
  try {
    const data = sessionStorage.getItem(PENDING_REQUESTS_KEY);
    if (!data) return { map: new Map(), pruned: false };
    const parsed = JSON.parse(data);
    const now = Date.now();
    const fresh = new Map();
    let prunedCount = 0;
    for (const [requestId, meta] of Object.entries(parsed)) {
      const registeredAt = meta?.registeredAt || 0;
      if (now - registeredAt > PENDING_REQUEST_MAX_AGE_MS) {
        prunedCount++;
        continue;
      }
      fresh.set(requestId, meta);
    }
    if (prunedCount > 0) {
      const obj = Object.fromEntries(fresh);
      sessionStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(obj));
      console.log('[TabSession] 清理过期 pending 请求', prunedCount, '条');
    }
    return { map: fresh, pruned: prunedCount > 0 };
  } catch (e) {
    console.warn('[TabSession] 读取 pending requests 失败:', e);
    return { map: new Map(), pruned: false };
  }
}

/**
 * 保存进行中请求（内部使用）
 * @param {Map<string, object>} map
 */
function savePendingRequestsMap(map) {
  try {
    const obj = Object.fromEntries(map);
    sessionStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(obj));
    updateBeforeUnloadHandler();
  } catch (e) {
    console.warn('[TabSession] 保存 pending requests 失败:', e);
  }
}

/**
 * 注册一个进行中的请求
 * @param {string} requestId - 请求唯一标识（如任务 localId、上传 ID 等）
 * @param {object} [meta={}] - 可选的元数据（如 appId、type、描述等）
 */
export function registerPendingRequest(requestId, meta = {}) {
  const { map } = getPendingRequestsMap();
  map.set(requestId, {
    ...meta,
    registeredAt: Date.now(),
  });
  savePendingRequestsMap(map);
  console.log('[TabSession] 注册请求:', requestId, meta);
}

/**
 * 取消注册请求（请求完成时调用）
 * @param {string} requestId - 请求唯一标识
 */
export function unregisterPendingRequest(requestId) {
  const { map } = getPendingRequestsMap();
  if (map.has(requestId)) {
    map.delete(requestId);
    savePendingRequestsMap(map);
    console.log('[TabSession] 取消注册请求:', requestId);
  }
}

/**
 * 检查当前 Tab 是否有进行中的请求
 * @returns {boolean}
 */
export function hasPendingRequests() {
  const { map, pruned } = getPendingRequestsMap();
  // 只在真正发生清理时刷新监听器，防止与 updateBeforeUnloadHandler 互相递归。
  // 终止保证：getPendingRequestsMap 写回后，下次进入时 pruned=false，递归深度 <= 2。
  if (pruned) updateBeforeUnloadHandler();
  return map.size > 0;
}

/**
 * 获取当前 Tab 所有进行中的请求
 * @returns {Array<{requestId: string, meta: object}>}
 */
export function getPendingRequests() {
  const { map, pruned } = getPendingRequestsMap();
  if (pruned) updateBeforeUnloadHandler(); // 同 hasPendingRequests，防递归
  return Array.from(map.entries()).map(([requestId, meta]) => ({
    requestId,
    meta,
  }));
}

/**
 * 获取进行中请求的数量
 * @returns {number}
 */
export function getPendingRequestsCount() {
  const { map, pruned } = getPendingRequestsMap();
  if (pruned) updateBeforeUnloadHandler(); // 同 hasPendingRequests，防递归
  return map.size;
}

/**
 * 清空并返回当前 Tab 的所有请求记录
 * 用于页面加载时清理"悬空"状态
 * @returns {Array<{requestId: string, meta: object}>}
 */
export function clearPendingRequests() {
  const requests = getPendingRequests();
  if (requests.length > 0) {
    sessionStorage.removeItem(PENDING_REQUESTS_KEY);
    updateBeforeUnloadHandler();
    console.log('[TabSession] 清空所有请求，共', requests.length, '个');
  }
  return requests;
}

// ==================== beforeunload 事件管理 ====================

// app 是否已完成初始化（canvas mount + clearPendingRequests + resumePendingOutputs 跑完）。
// false 期间 beforeunload 不拦截 —— 加载/恢复窗口里的 pending 记录是上一轮 session 的残留，
// 当前页面还没接管它们，不该用它们绑架用户。详见 spec §4.1。
let appReady = false;

/**
 * 标记 app 已就绪 —— 由 canvas 完成初始化（clearPendingRequests + resumePendingOutputs）后调用。
 * 调用前 beforeunload 监听器永远不会装上，即使 sessionStorage 有 pending 记录。
 * 可安全多次调用（幂等）：再次调用不会重复装监听器（updateBeforeUnloadHandler 自带幂等保护）。
 */
export function markAppReady() {
  appReady = true;
  console.log('[TabSession] app 标记为已就绪');
  // 标记完后立刻校验一次：如果此刻已经有 pending 记录，需要补装监听器
  updateBeforeUnloadHandler();
}

let beforeUnloadHandler = null;

/**
 * beforeunload 事件处理函数
 * @param {BeforeUnloadEvent} e
 */
function handleBeforeUnload(e) {
  // 防御守卫：updateBeforeUnloadHandler 在 appReady=false 时阻止装监听器，
  // 当前路径下 handler 不会被触发；但若未来有人直接 addEventListener(handleBeforeUnload)
  // 绕开 updateBeforeUnloadHandler，这里仍能兜底拒绝弹窗。详见 spec §4.1 A 块。
  if (!appReady) return;
  if (hasPendingRequests()) {
    const count = getPendingRequestsCount();
    const message = `有 ${count} 个正在进行的请求，确定要离开吗？`;
    e.preventDefault();
    // 现代浏览器会忽略自定义消息，但仍需设置 returnValue
    e.returnValue = message;
    return message;
  }
}

/**
 * 更新 beforeunload 事件监听器
 * 有请求时添加，无请求时移除
 */
function updateBeforeUnloadHandler() {
  // appReady=false 时永远不装监听器；appReady=true 时按 pending 记录有无装/卸。
  const shouldListen = appReady && hasPendingRequests();

  if (shouldListen && !beforeUnloadHandler) {
    beforeUnloadHandler = handleBeforeUnload;
    window.addEventListener('beforeunload', beforeUnloadHandler);
    console.log('[TabSession] 添加 beforeunload 监听器');
  } else if (!shouldListen && beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
    console.log('[TabSession] 移除 beforeunload 监听器');
  }
}

// ==================== 初始化 ====================

// 模块加载时确保 Tab ID 存在
getTabId();

// 初始化 beforeunload 监听器状态
updateBeforeUnloadHandler();

// ==================== HMR full reload 友好处理 ====================

// 仅在 dev 模式 (import.meta.hot 存在) 下挂钩。
// Vite 在执行 location.reload() 之前会广播 'vite:beforeFullReload' 事件，
// 这是识别"reload 不是用户触发"的唯一可靠信号。
//
// 跳过弹窗后：reload 真的发生 → 新页面加载 → 新模块跑 updateBeforeUnloadHandler
// 重新装监听器（如果还有 pending 记录），周期重置。sessionStorage 不清空，
// 新页面会走 resumePendingOutputs 续传，行为跟用户手动刷新的"保留状态再续传"一致。
// 详见 spec §4.2 B 块。
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
      console.log('[TabSession] HMR full reload，临时跳过 beforeunload');
    }
  });
}
