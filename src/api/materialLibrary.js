/**
 * 素材库 API — 调 ai-tools-api 的 /api/apps/ai-canvas/v1/material-library/* 端点
 *
 * 所有接口走 POST，路径里带动词（RPC 风格）。鉴权由 apiClient 自动注入 JWT + X-Team-Id。
 * 响应统一 {code, message, data}，apiClient 已 unwrap data。
 *
 * 16 个端点全接通：folders/items 各 5 (含 restore) + favorites 3 + trash 3。
 * 形态对齐文档 /ai-tools-api/docs/API_REFERENCE/apps/ai_canvas/material_library.md。
 */
import apiClient from './client'

const BASE = '/api/apps/ai-canvas/v1/material-library'

// === DEBUG 延时（调试素材库 loading UI 用） ===
// 仅作用于 3 个 list 接口（folders/items/favorites）；写接口不加。
// 改 0 = 关闭；改正整数（如 800）= 强制 sleep 那么多 ms，方便观察骨架 / spinner / SWR 切换。
const DEBUG_LIST_DELAY_MS = 0
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

export const materialLibrary = {
  folders: {
    /**
     * 拉当前 scope 下所有文件夹（扁平列表，含 parent_id）。
     * personal scope 首次调用后端会懒创建默认 6 个文件夹。
     * @param {{scope: 'personal'|'team'}} params
     * @returns {Promise<{folders: Array<Folder>}>}
     */
    list: async ({ scope }) => {
      await sleep(DEBUG_LIST_DELAY_MS)
      return apiClient.post(`${BASE}/folders/list`, { scope })
    },

    /**
     * 创建文件夹。后端校验深度 ≤ 3、同 parent 下 name 不重复。
     * @param {{scope, parent_id?, name}} body
     * @returns {Promise<{folder: Folder}>}
     */
    create: (body) => apiClient.post(`${BASE}/folders/create`, body),

    /**
     * 改名 / 移动。后端校验：不能成自己后代、新位置深度 ≤ 3、同级 name 唯一。
     * @param {{id, name?, parent_id?}} body
     * @returns {Promise<{folder: Folder}>}
     */
    update: (body) => apiClient.post(`${BASE}/folders/update`, body),

    /**
     * 软删文件夹 + 级联软删后代 folder/item。
     * @param {{id: number}} params
     * @returns {Promise<{id, deleted_at, cascade_count}>}
     */
    delete: ({ id }) => apiClient.post(`${BASE}/folders/delete`, { id }),

    /**
     * 还原文件夹（递归还原跟它一起被删的后代；链式向上还原祖先）。
     * @param {{id: number}} params
     */
    restore: ({ id }) => apiClient.post(`${BASE}/folders/restore`, { id }),
  },
  items: {
    /**
     * 分页列表。folder_id=null 代表根目录；search 可选。
     * @param {{scope, folder_id?, search?, limit?, offset?}} params
     * @returns {Promise<{items: Array<Material>, total: number, limit: number, offset: number}>}
     */
    list: async ({ scope, folder_id = null, search, limit = 50, offset = 0 }) => {
      await sleep(DEBUG_LIST_DELAY_MS)
      return apiClient.post(`${BASE}/items/list`, { scope, folder_id, search, limit, offset })
    },

    /**
     * 注册一条素材（文件已 OSS 上传完，或来源画布节点）。
     * @param {object} body 见 spec §5.2
     * @returns {Promise<{item: Material}>}
     */
    create: (body) => apiClient.post(`${BASE}/items/create`, body),

    /**
     * 改名 / 移动文件夹（folder_id 改）。后端校验新 folder 必须同 scope。
     * @param {{id, name?, folder_id?}} body
     * @returns {Promise<{item: Material}>}
     */
    update: (body) => apiClient.post(`${BASE}/items/update`, body),

    /**
     * 软删素材，OSS 文件不动。
     * @param {{id: number}} params
     */
    delete: ({ id }) => apiClient.post(`${BASE}/items/delete`, { id }),

    /**
     * 还原已软删的素材。链式向上还原祖先 folder（若 folder_id 指向的 folder 也在回收站）。
     * @param {{id: number}} params
     */
    restore: ({ id }) => apiClient.post(`${BASE}/items/restore`, { id }),
  },
  favorites: {
    /**
     * 当前用户的收藏列表（跨 scope；已过滤软删素材）。
     * @param {{limit?: number, offset?: number}} params
     * @returns {Promise<{favorites: Array<{id, material_id, created_at, item: Material}>, total, limit, offset}>}
     */
    list: async ({ limit = 50, offset = 0 } = {}) => {
      await sleep(DEBUG_LIST_DELAY_MS)
      return apiClient.post(`${BASE}/favorites/list`, { limit, offset })
    },

    /**
     * 加收藏，重复调用幂等。
     * @param {{item_id: number}} params
     */
    add: ({ item_id }) => apiClient.post(`${BASE}/favorites/add`, { item_id }),

    /**
     * 取消收藏。
     * @param {{item_id: number}} params
     */
    remove: ({ item_id }) => apiClient.post(`${BASE}/favorites/remove`, { item_id }),
  },
  trash: {
    /**
     * 列回收站（混合 folder + item，按 deleted_at desc）。
     * @param {{scope: 'personal'|'team'}} params
     * @returns {Promise<{entries: Array<{type:'item'|'folder', id, name, deleted_at, media_type?, url?, thumbnail_url?, parent_id?, descendant_count?}>}>}
     */
    list: ({ scope }) => apiClient.post(`${BASE}/trash/list`, { scope }),

    /**
     * 彻底删除单项（OSS 文件同步删）。
     * @param {{type: 'item'|'folder', id: number}} params
     */
    purge: ({ type, id }) => apiClient.post(`${BASE}/trash/purge`, { type, id }),

    /**
     * 清空当前 scope 整个回收站。
     * @param {{scope: 'personal'|'team'}} params
     */
    empty: ({ scope }) => apiClient.post(`${BASE}/trash/empty`, { scope }),
  },
}

export default materialLibrary
