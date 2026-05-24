/**
 * 文件相关 API
 *
 * 对应 ai-tools-api 的 /api/v1/files/* 接口
 */

import apiClient from './client'

export const fileApi = {
  /**
   * 获取上传预签名 URL
   * @param {object} data
   * @param {string} data.filename
   * @param {string} data.content_type
   * @param {number} [data.file_size]
   */
  presignUrl: (data) => apiClient.post('/api/v1/files/presign-url', data),

  /**
   * 确认上传完成
   * @param {object} data
   * @param {string} data.file_url
   * @param {number} data.file_size
   * @param {string} [data.purpose]
   */
  confirm: (data) => apiClient.post('/api/v1/files/confirm', data),

  /**
   * Base64/URL 上传
   * @param {object} data
   * @param {string} [data.base64]
   * @param {string} [data.url]
   * @param {string} [data.filename]
   * @param {string} [data.content_type]
   * @param {string} [data.task_id]
   */
  upload: (data) => apiClient.post('/api/v1/files/upload', data),

  /**
   * 删除文件
   * @param {object} data
   * @param {string} data.file_url
   */
  delete: (data) => apiClient.post('/api/v1/files/delete', data),
}

export default fileApi
