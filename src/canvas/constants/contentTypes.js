/**
 * 档案类输出 subtype 登记
 *
 * 档案类（Reference ID）= 上游返回的字符串引用,无 url,需要走 ReferenceIdRenderer
 * 单独渲染。与 image / video 等"有 url 可直接展示"的内容类型语义不同。
 */

export const REFERENCE_ID_SUBTYPES = ['profile-id', 'voice-id', 'character-id']

export function isReferenceIdSubType(subType) {
  return REFERENCE_ID_SUBTYPES.includes(subType)
}

export const REFERENCE_ID_LABELS = {
  'profile-id': 'Profile',
  'voice-id': 'Voice',
  'character-id': 'Character',
}

export const REFERENCE_ID_NAME_KEYS = {
  'profile-id': 'profile_name',
  'voice-id': 'voice_name',
  'character-id': 'character_name',
}

export const REFERENCE_ID_VALUE_KEYS = {
  'profile-id': 'profile_id',
  'voice-id': 'voice_id',
  'character-id': 'character_id',
}
