/**
 * VoicePresets platform 接口
 *
 * 用途:为 minimax-speech capability 的"扩展预设音色清单"功能(673 条音色)
 * 和"团队克隆音色"功能提供运行时实现。
 *
 * 实现说明:具体实现调用 /api/apps/ai-canvas/v1/sound/minimax-speech/* 路由拉取
 *           预设与克隆音色;无该能力的精简实现为 stub,直接抛 unsupported,
 *           UI 调用方应捕获并提示用户改用 17 个通用预设字符串。
 *
 * @typedef {object} VoicePresetItem
 * @property {string} id          内部 DB ID(数字字符串),仅追溯用
 * @property {string} voice_id    音色 ID,直接填入合成请求 voice_setting.voice_id
 * @property {string} voice_name  展示名称(随 language 切换中英文)
 * @property {string[] | null} [tag_list]
 * @property {string | null} [cover_url]
 * @property {string | null} [sample_audio]
 * @property {string | null} [description]
 *
 * @typedef {object} VoiceCloneItem
 * @property {string} id                    记录 ID (gen_id)
 * @property {string} voice_id              可复用音色 ID
 * @property {string} voice_name            展示名称
 * @property {string[]} tag_list            标签
 * @property {string} sample_audio          预览音频 OSS URL (无预览时为 "")
 * @property {string} description           文字描述
 * @property {string} language              语言
 * @property {string} accent                口音
 * @property {string} gender                性别
 * @property {string} age                   年龄段
 * @property {string} reference_audio_url   参考音频 OSS URL
 * @property {string | null} reference_audio_text  提交时的预览文本
 * @property {string} created_at            ISO 8601 创建时间
 * @property {boolean} favorited            当前调用用户是否已收藏
 *
 * @typedef {object} VoicePresetsCapabilities
 * @property {boolean} cloneVoices  是否支持团队克隆音色列表 (listMyVoices)
 * @property {boolean} favorites    是否支持个人收藏 (listFavoritedVoices / toggleFavorite)
 *
 * @typedef {object} VoicePresets
 * @property {(language: 'zh' | 'en', opts?: { force?: boolean }) => Promise<VoicePresetItem[]>} fetch
 *           按语言拉取扩展预设音色清单 (673 条)。失败时抛错,调用方决定 toast/UI。
 *           opts.force = true 绕过模块级缓存重新请求(用于用户点刷新按钮)。
 *           本地 stub 抛 Error('VoicePresets fetch is not available in this build')。
 * @property {() => Promise<VoiceCloneItem[]>} listMyVoices
 *           拉取当前团队的克隆音色列表。失败时抛错。
 *           本地 stub 抛 Error('listMyVoices is not available in this build')。
 * @property {() => Promise<VoiceCloneItem[]>} listFavoritedVoices
 *           拉取当前用户收藏的克隆音色列表 (favorited 恒为 true)。失败时抛错。
 *           本地 stub 抛 Error('listFavoritedVoices is not available in this build')。
 * @property {(voiceId: string, favorited: boolean) => Promise<VoiceCloneItem>} toggleFavorite
 *           切换音色收藏状态。`favorited=true` 收藏 / `false` 取消。失败时抛错。
 *           本地 stub 抛 Error('toggleFavorite is not available in this build')。
 * @property {(voiceId: string, patch: object) => Promise<VoiceCloneItem>} updateVoice
 *           编辑克隆音色信息 (voice_name / tag_list / description / language / accent / gender / age)。
 *           仅传改动字段。失败时抛错。
 *           本地 stub 抛 Error('updateVoice is not available in this build')。
 * @property {(projectId: string, nodeId: string, audioUrl: string, text?: string, extraTaskId?: string) => Promise<object>} submitClone
 *           提交克隆任务。audioUrl 必须 HTTP(s) 可访问且 >=10s。text 可选(给上游生成预览音频)。
 *           返回 Task 快照，调用方用 useTaskPolling 轮询到完成态。
 *           本地 stub 抛 Error('submitClone is not available in this build')。
 * @property {VoicePresetsCapabilities} capabilities
 *           能力声明 — UI 据此条件渲染 (如不支持时隐藏「我的音色」/「收藏音色」tab)。
 */
export {}
