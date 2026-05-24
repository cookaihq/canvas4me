/**
 * GPT Image 2 分辨率工具：把 ratio × clarity 拼成上游可接受的 {width,height}
 *
 * 后端契约约束（见 ai-tools-api docs/.../gpt_image_2.md）：
 *   - 边长 16 倍数
 *   - 边长范围 256-3840
 *   - 长短边比 ≤ 3:1
 *   - 总像素 655_360 - 8_294_400
 *
 * 算法：clarity 锚定长边目标值；按 ratio 算短边并 round 到 16 倍数；
 * 再对结果做合规校验，不合规返回 reason 让上层显示 disabled tooltip。
 */

export const ASPECT_RATIOS = [
  { value: '1:1',  w: 1,  h: 1  },
  { value: '1:2',  w: 1,  h: 2  },
  { value: '2:1',  w: 2,  h: 1  },
  { value: '9:16', w: 9,  h: 16 },
  { value: '16:9', w: 16, h: 9  },
  { value: '3:4',  w: 3,  h: 4  },
  { value: '4:3',  w: 4,  h: 3  },
  { value: '3:2',  w: 3,  h: 2  },
  { value: '2:3',  w: 2,  h: 3  },
  { value: '5:4',  w: 5,  h: 4  },
  { value: '4:5',  w: 4,  h: 5  },
  { value: '21:9', w: 21, h: 9  },
  { value: '9:21', w: 9,  h: 21 },
]

export const CLARITIES = [
  { value: '1K', longSide: 1024 },
  { value: '2K', longSide: 2048 },
  { value: '4K', longSide: 3840 },
]

const MIN_SIDE = 256
const MAX_SIDE = 3840
const MIN_PIXELS = 655_360
const MAX_PIXELS = 8_294_400
const STEP = 16

function round16(n) {
  return Math.round(n / STEP) * STEP
}

function findRatio(value) {
  return ASPECT_RATIOS.find(r => r.value === value) || null
}

function findClarity(value) {
  return CLARITIES.find(c => c.value === value) || null
}

/**
 * 按 ratio + clarity 计算 (width, height)
 * 返回 { ok: true, width, height } 或 { ok: false, reason }
 */
export function computeResolution(ratioValue, clarityValue) {
  const ratio = findRatio(ratioValue)
  const clarity = findClarity(clarityValue)
  if (!ratio || !clarity) {
    return { ok: false, reason: '参数无效' }
  }

  const isLandscape = ratio.w >= ratio.h
  const longTarget = clarity.longSide
  const aspect = ratio.w / ratio.h

  let width
  let height
  if (isLandscape) {
    width = round16(longTarget)
    height = round16(longTarget / aspect)
  } else {
    height = round16(longTarget)
    width = round16(longTarget * aspect)
  }

  // 合规校验
  if (width < MIN_SIDE || height < MIN_SIDE) {
    return { ok: false, reason: '边长过小' }
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, reason: '边长超过 3840' }
  }
  const pixels = width * height
  if (pixels > MAX_PIXELS) {
    return { ok: false, reason: '总像素超上限（>8.29M）' }
  }
  if (pixels < MIN_PIXELS) {
    return { ok: false, reason: '总像素过低（<655K）' }
  }
  // 长短边 ≤ 3:1（14 个 ratio 中最大 21:9 ≈ 2.33:1，理论上不会触发；保留作为安全网）
  const maxSide = Math.max(width, height)
  const minSide = Math.min(width, height)
  if (maxSide / minSide > 3) {
    return { ok: false, reason: '长短边比超过 3:1' }
  }

  return { ok: true, width, height }
}

/**
 * 检查某个 (ratio, clarity) 组合是否合规（供 popover 决定按钮 disabled 态）
 */
export function isCombinationValid(ratioValue, clarityValue) {
  return computeResolution(ratioValue, clarityValue).ok
}

/**
 * 给定 ratio，返回每个 clarity 的合规性（用于联动 disabled）
 */
export function getClarityAvailability(ratioValue) {
  return CLARITIES.map(c => {
    const r = computeResolution(ratioValue, c.value)
    return { value: c.value, ok: r.ok, reason: r.ok ? null : r.reason }
  })
}

/**
 * 给定 clarity，返回每个 ratio 的合规性（用于联动 disabled）
 */
export function getRatioAvailability(clarityValue) {
  return ASPECT_RATIOS.map(r => {
    const result = computeResolution(r.value, clarityValue)
    return { value: r.value, ok: result.ok, reason: result.ok ? null : result.reason }
  })
}
