export const TOPAZ_MODE = 'upscale-video'
export const TOPAZ_MODEL = 'topaz-upscale-video'
export const DEFAULT_ENHANCEMENT_MODEL = 'Proteus'
export const DEFAULT_UPSCALE_FACTOR = 2

export const TOPAZ_MODEL_FAMILIES = [
  {
    id: 'general',
    label: '通用增强',
    summary: '适合大多数视频，在降噪、压缩痕迹和细节恢复之间做均衡处理。',
    models: [
      ['Proteus', '默认模型，通用修复和细节增强的均衡选择。'],
    ],
  },
  {
    id: 'compression',
    label: '压缩修复',
    summary: '面向压缩痕迹、码率不足和旧素材伪影，按素材损伤程度选择强度。',
    models: [
      ['Artemis HQ', '轻度压缩或高质量来源，保留自然细节。'],
      ['Artemis MQ', '中等压缩来源，在修复和稳定之间取平衡。'],
      ['Artemis LQ', '低质量或重压缩来源，优先清理明显伪影。'],
    ],
  },
  {
    id: 'denoise',
    label: '降噪清理',
    summary: '面向噪点、颗粒和脏画面清理，适合夜景、旧片和高 ISO 素材。',
    models: [
      ['Nyx', '标准降噪，适合多数噪点清理任务。'],
      ['Nyx Fast', '更快的降噪选项，适合预览或批量处理。'],
      ['Nyx XL', '更强的清理能力，适合噪点更重的素材。'],
      ['Nyx HF', '偏向保留高频纹理，减少细节被抹平。'],
    ],
  },
  {
    id: 'upscale',
    label: '高质量放大',
    summary: '面向高清放大和细节重建，适合画面相对干净、希望提升分辨率的素材。',
    models: [
      ['Gaia HQ', '真实影像高质量放大，保留自然质感。'],
      ['Gaia CG', 'CG、动画或图形类内容的放大增强。'],
      ['Gaia 2', '新一代 Gaia 放大模型，适合更高质量输出。'],
    ],
  },
  {
    id: 'generative',
    label: '生成式增强',
    summary: '通过生成式方式补足细节，适合需要更强恢复或锐化观感的素材。',
    models: [
      ['Starlight Precise 1', '精确型生成增强，强调稳定和可控。'],
      ['Starlight Precise 2', '精确型生成增强的迭代版本。'],
      ['Starlight Precise 2.5', '更细化的精确增强版本。'],
      ['Starlight HQ', '高质量生成式增强，优先输出观感。'],
      ['Starlight Mini', '轻量生成式增强，适合快速尝试。'],
      ['Starlight Sharp', '偏锐化和边缘清晰度提升。'],
      ['Starlight Fast 1', '快速生成式增强，适合预览。'],
      ['Starlight Fast 2', '快速生成式增强的迭代版本。'],
    ],
  },
]

export const TOPAZ_ENHANCEMENT_MODELS = TOPAZ_MODEL_FAMILIES
  .flatMap((family) => family.models.map(([name]) => name))
