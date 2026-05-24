/**
 * CanvasStore 接口 — 画布列表/详情的存取层
 *
 * 职责:画布元数据 + 画布数据(nodes/edges/viewport) 的纯 CRUD。
 * 不含锁、跨窗观察、用户/团队等装饰层概念,这些由装饰层实现单独提供。
 *
 * 实现:
 *
 * @typedef {object} CanvasMeta
 * @property {string} id
 * @property {string} name
 * @property {string} [updated_at]
 *
 * @typedef {object} CanvasDetail
 * @property {string} id
 * @property {string} name
 * @property {object} canvas               nodes/edges/viewport
 * @property {object} [lock_status]        装饰层实现可能带 (impl 不返回)
 *
 * @typedef {object} CanvasListOptions
 * @property {'mine' | 'team'} [scope]  范围过滤:'mine' 仅自己创建,'team' 团队全部(默认)。
 *                                       实现可在 `capabilities.scopeMine === false` 时忽略此参数。
 *
 * @typedef {object} CanvasStoreCapabilities
 * @property {boolean} [scopeMine]  是否支持 list({ scope: 'mine' }) 服务端过滤。
 *                                   多用户场景为 true;单用户本地存储为 false。
 *
 * @typedef {object} CanvasStore
 * @property {(opts?: CanvasListOptions) => Promise<CanvasMeta[]>}             list
 * @property {(name: string) => Promise<CanvasMeta>}                           create
 * @property {(id: string) => Promise<CanvasDetail>}                           get
 * @property {(id: string, name: string) => Promise<void>}                     rename
 * @property {(id: string) => Promise<void>}                                   delete
 * @property {(id: string, data: { nodes, edges, viewport }) => Promise<void>} saveCanvas
 * @property {CanvasStoreCapabilities} [capabilities]                          实现能力声明,缺省视为全 false
 */

export {} // 类型描述文件
