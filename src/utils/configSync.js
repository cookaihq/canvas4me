import { configService } from '../services/configService'
import { tokenManager } from './tokenManager'

export async function syncWithServer() {
  if (!tokenManager.isLoggedIn()) {
    return { success: false, error: '未登录' }
  }

  try {
    await configService.loadConfig()
    return { success: true }
  } catch (error) {
    console.error('[configSync] Sync failed:', error)
    return { success: false, error: error?.message || '同步失败' }
  }
}
