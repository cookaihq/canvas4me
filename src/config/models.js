/**
 * 全局模型配置
 *
 * 统一管理所有 LLM 模型的配置信息，供各应用共享使用
 */

// ============================================================================
// 基础参数模板
// ============================================================================

/**
 * 默认的创意度分档
 * - conservative: 保守模式，输出更确定
 * - balanced: 平衡模式
 * - creative: 创意模式，输出更多样化
 */
export const BASE_CREATIVITY = {
  conservative: { temperature: 0.5, top_p: 0.8 },
  balanced: { temperature: 0.7, top_p: 0.9 },
  creative: { temperature: 0.9, top_p: 0.95 }
};

/**
 * 默认的功能角色参数
 * - summarizer: 摘要生成，需要更确定的输出
 * - uiSignalParser: UI 信号解析，需要高精度
 */
export const BASE_FUNCTIONAL_PARAMS = {
  summarizer: { temperature: 0.3, top_p: 0.8 },
  uiSignalParser: { temperature: 0.2, top_p: 0.7 }
};

// ============================================================================
// 主模型列表
// ============================================================================

/**
 * 应用内置的模型配置（固定列表，用户不可添加/删除，只能调整参数）
 *
 * 配置说明：
 * - id: 模型唯一标识
 * - name: 显示名称
 * - modelId: API 调用时使用的模型 ID
 * - contextLength: 上下文长度限制
 * - mergeSystemToUser: 是否将 system prompt 合并到第一个 user message（某些模型不支持 system role）
 * - creativity: 创意度参数配置
 * - functionalParams: 功能角色参数配置
 */
export const DEFAULT_MODELS = [
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    modelId: 'claude-opus-4-5-20251101',
    contextLength: 200000,
    creativity: {
      conservative: { temperature: 0.5 },
      balanced: { temperature: 0.7 },
      creative: { temperature: 0.9 }
    },
    functionalParams: {
      summarizer: { temperature: 0.3 },
      uiSignalParser: { temperature: 0.2 }
    }
  },
  {
    id: 'gpt-5.2',
    name: 'gpt-5.2',
    modelId: 'gpt-5.2',
    contextLength: 128000,
    mergeSystemToUser: true,
    creativity: { ...BASE_CREATIVITY },
    functionalParams: { ...BASE_FUNCTIONAL_PARAMS }
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    modelId: 'gpt-5.1',
    contextLength: 128000,
    mergeSystemToUser: true,  // gpt-5.1 不支持 system role，需要合并到 user
    creativity: { ...BASE_CREATIVITY },
    functionalParams: { ...BASE_FUNCTIONAL_PARAMS }
  },
  {
    id: 'nova-2-lite-v1',
    name: 'Nova 2 Lite',
    modelId: 'nova-2-lite-v1',
    contextLength: 128000,
    creativity: { ...BASE_CREATIVITY },
    functionalParams: { ...BASE_FUNCTIONAL_PARAMS }
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    modelId: 'gemini-3-pro-preview',
    contextLength: 1000000,
    creativity: { ...BASE_CREATIVITY },
    functionalParams: { ...BASE_FUNCTIONAL_PARAMS }
  }
];

// ============================================================================
// 专用模型列表
// ============================================================================

/**
 * Gemini 图片生成模型列表（第一个为默认模型）
 */
export const DEFAULT_GEMINI_IMAGE_MODELS = [
  'gemini-3-pro-image-preview-vip',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image-preview-2k',
];

/**
 * JSON 修复模型列表（第一个为默认模型）
 * 推荐使用快速便宜的模型，因为 JSON 修复是纯格式任务
 */
export const DEFAULT_JSON_REPAIR_MODELS = [
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5（默认）' },
  { id: 'gpt-5.2', name: 'GPT-5.2' },
];

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 根据模型 ID 获取模型配置
 * @param {string} modelId - 模型 ID
 * @returns {Object|null} 模型配置对象
 */
export const getModelConfig = (modelId) => {
  return DEFAULT_MODELS.find(m => m.id === modelId || m.modelId === modelId) || null;
};

/**
 * 获取模型的上下文长度
 * @param {string} modelId - 模型 ID
 * @returns {number} 上下文长度，默认返回 128000
 */
export const getModelContextLength = (modelId) => {
  const config = getModelConfig(modelId);
  return config?.contextLength || 128000;
};

/**
 * 检查模型是否需要合并 system prompt 到 user message
 * @param {string} modelId - 模型 ID
 * @returns {boolean}
 */
export const shouldMergeSystemToUser = (modelId) => {
  const config = getModelConfig(modelId);
  return config?.mergeSystemToUser === true;
};

/**
 * 获取用于 Select/AutoComplete 的模型选项列表
 * @param {Object} options - 选项
 * @param {boolean} options.includeRecommendLabel - 是否在第一个选项后添加"推荐"标签
 * @returns {Array<{label: string, value: string}>}
 */
export const getModelOptions = (options = {}) => {
  const { includeRecommendLabel = false } = options;

  return DEFAULT_MODELS.map((model, index) => ({
    label: index === 0 && includeRecommendLabel
      ? `${model.name} (推荐)`
      : model.name,
    value: model.modelId
  }));
};
