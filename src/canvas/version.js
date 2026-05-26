/**
 * 画布版本号 —— 缓存探测机制
 *
 * 显示在画布右下角(替换 React Flow 默认 attribution),用来判断用户浏览器里
 * 加载的代码是否最新。用户报告"我看到 vN",对比本常量即可判断缓存是否过期。
 *
 * ⚠️ 规则:每次任务完成必须把这个数字 +1。详见 CLAUDE.md §版本号。
 */
export const CANVAS_VERSION = 583
