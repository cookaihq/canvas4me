/**
 * 认证相关 API
 *
 * 对应 ai-tools-api 的 /api/v1/auth/* 接口
 */

import apiClient from './client'

export const authApi = {
  /**
   * 发送邮箱验证码
   * @param {string} email - 邮箱地址
   * @param {string} purpose - 用途：register | login | reset_password
   */
  sendEmailCode: (email, purpose) =>
    apiClient.post('/api/v1/auth/send-email-code', { email, purpose }, { skipAuth: true }),

  /**
   * 用户注册
   * @param {string} email - 邮箱地址
   * @param {string} code - 6位验证码
   * @param {string} password - 密码（6-32位）
   * @param {string} displayName - 显示名称（可选）
   * @returns {Promise<{access_token, refresh_token, token_type, expires_in, user}>}
   */
  register: (email, code, password, displayName) =>
    apiClient.post(
      '/api/v1/auth/register',
      {
        email,
        code,
        password,
        display_name: displayName,
      },
      { skipAuth: true }
    ),

  /**
   * 密码登录
   * @param {string} account - 邮箱或用户名
   * @param {string} password - 密码
   * @returns {Promise<{access_token, refresh_token, token_type, expires_in, user}>}
   */
  login: (account, password) =>
    apiClient.post('/api/v1/auth/login', { account, password }, { skipAuth: true }),

  /**
   * 验证码登录
   * @param {string} email - 邮箱地址
   * @param {string} code - 6位验证码
   * @returns {Promise<{access_token, refresh_token, token_type, expires_in, user}>}
   */
  loginWithCode: (email, code) =>
    apiClient.post('/api/v1/auth/login-with-code', { email, code }, { skipAuth: true }),

  /**
   * 刷新 Token
   * @param {string} refreshToken - Refresh Token
   * @returns {Promise<{access_token, expires_in}>}
   */
  refresh: (refreshToken) =>
    apiClient.post('/api/v1/auth/refresh', { refresh_token: refreshToken }, { skipAuth: true }),

  /**
   * 登出
   * @param {string} refreshToken - Refresh Token
   */
  logout: (refreshToken) => apiClient.post('/api/v1/auth/logout', { refresh_token: refreshToken }),

  /**
   * 重置密码
   * @param {string} email - 邮箱地址
   * @param {string} code - 6位验证码
   * @param {string} newPassword - 新密码（6-32位）
   */
  resetPassword: (email, code, newPassword) =>
    apiClient.post(
      '/api/v1/auth/reset-password',
      {
        email,
        code,
        new_password: newPassword,
      },
      { skipAuth: true }
    ),
}

export default authApi
