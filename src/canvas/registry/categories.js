/**
 * 能力分类(category)字典 —— 纯展示标签,只供能力选择器排版分组。
 *
 * category 不是节点上的一层概念,不进节点 data、不改路由、不改切换语义。
 * 层级仍是 nodeType → capability → mode。capability 在自己的 register.js
 * 用 `category: <id>` 声明归属;无 category 的能力落"默认桶"(无标题、平铺渲染)。
 *
 * 字段:
 *   - label: 分组标题文案
 *   - icon:  分组标题图标(来自 @/canvas/icons 的 lucide 组件)
 *   - order: 分组排序(小的在前)
 */
import { UserRound, Sparkles, WandSparkles, Mic, Music } from '@/canvas/icons'

export const CATEGORIES = {
  'talking-head':     { label: '数字人',   icon: UserRound,    order: 10 },
  'video-gen':        { label: '视频生成', icon: Sparkles,     order: 20 },
  'video-process':    { label: '视频处理', icon: WandSparkles, order: 30 },
  'speech-synthesis': { label: '语音合成', icon: Mic,          order: 40 },
  'music-gen':        { label: '音乐生成', icon: Music,        order: 50 },
}
