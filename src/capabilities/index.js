/**
 * 子能力注册 barrel —— 由 src/canvas/index.jsx 在画布初始化时 import 一次,
 * 触发各 register.js 模块加载并自动调 registerCapability(...)。
 *
 * 新增子能力:在此文件追加 `import './{nodeType}/{cap}/register'` 一行即可。
 * 删除子能力:删 import + 删对应目录。
 */

// ─── 图像 ───
import './image/gpt-image-2/register'
import './image/nano-banana/register'

// ─── 视频 ───
import './video/kling-v3/register'
import './video/seedance-2/register'
import './video/fabric/register'
import './video/creatify-aurora/register'
import './video/sync/register'
import './video/topaz/register'

// ─── 音频 ───
import './sound/minimax-speech/register'
import './sound/lyria-3/register'
import './sound/minimax-music/register'

// ─── 工具 ───
import './tool/index'

// ─── 大语言模型 ───
// llm capability:4 个 mode 按输入类型切分(text/vision/audio/video),
// 各 mode 对应后端独立 capability。
import './llm/llm/register'
