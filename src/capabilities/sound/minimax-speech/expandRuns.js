/**
 * MiniMax Speech expandRuns —— 把"点一次 Run"拆成 N 次迭代.
 *
 * 见 docs/capabilities/sound/minimax-speech.md §"批量模式运行时".
 *
 * quick 模式:
 *   - 不切分; runCount = M; 直接 M 次迭代, 每次独立 task_id (沿用通用倍数派生)
 *
 * batch 模式:
 *   - 按面板 `separator` 切分 prompt 为 N 段
 *   - 倍数 ×M 与 N 互乘, 共 N×M 次迭代
 *   - 每次迭代独立 task_id (不共享上游一次调用, 因为每段是独立的上游 submit)
 *   - 每次迭代 modeParamsOverride.prompt = 该段文本
 *   - 派生的折叠能力节点名 = "{该段前 5 字} [i/N]"
 *
 * 切分校验:
 *   - N = 0 → 抛错 (调用方 toast)
 *   - 任一段超过 10000 字符 → 抛错
 *
 * 关键: folded 形态下 useRunCapability 会按 iterations 数量派生 N×M 个能力节点
 *       (i=0 是当前节点, i>0 派生). 这里只负责返回正确的迭代列表.
 */

import {
  splitPromptBySeparator,
  DEFAULT_SEPARATOR,
  MAX_PROMPT_LENGTH,
} from './voice-presets'

const NAME_PREFIX_LEN = 5

function buildSegmentName(seg, idx, total) {
  let prefix = seg.slice(0, NAME_PREFIX_LEN)
  if (seg.length > NAME_PREFIX_LEN) prefix += '…'
  return `${prefix} [${idx + 1}/${total}]`
}

export function expandMinimaxSpeechRuns({ mode, modeParams = {}, collectedInputs = {}, runCount = 1 }) {
  const multiplier = Math.max(1, runCount | 0)

  if (mode === 'quick') {
    // quick: M 次纯倍数派生; 不需要 nodeName/modeParamsOverride (folded 派生时 useRunCapability 自动派)
    return Array.from({ length: multiplier }, () => ({}))
  }

  if (mode === 'batch') {
    // 取端口连入的 prompt 优先, 否则面板 textarea
    const portInput = collectedInputs.prompt
    const portFirst = Array.isArray(portInput) ? portInput[0] : portInput
    const promptText = portFirst?.content?.text || modeParams.prompt || ''
    const separator = modeParams.separator || DEFAULT_SEPARATOR

    const segments = splitPromptBySeparator(promptText, separator)

    if (segments.length === 0) {
      throw new Error('请输入待合成文本')
    }

    // 每段长度校验
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].length > MAX_PROMPT_LENGTH) {
        throw new Error(`第 ${i + 1} 段超过 ${MAX_PROMPT_LENGTH} 字符限制, 请缩短或调整分隔`)
      }
    }

    const total = segments.length * multiplier
    const iterations = []
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const seg = segments[segIdx]
      for (let m = 0; m < multiplier; m++) {
        const flatIdx = segIdx * multiplier + m
        iterations.push({
          // 每个派生节点的 prompt = 该段文本
          modeParamsOverride: { prompt: seg },
          // 派生节点名: 该段前 5 字 + 序号
          nodeName: buildSegmentName(seg, flatIdx, total),
        })
      }
    }
    return iterations
  }

  // 未知 mode 兜底
  return Array.from({ length: multiplier }, () => ({}))
}
