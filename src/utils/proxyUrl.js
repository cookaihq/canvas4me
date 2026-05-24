/**
 * URL 代理工具
 * 将外部 URL 转换为本地代理 URL，解决 CORS 问题
 */

// OSS 域名 → 代理路径 映射
const PROXY_MAP = {
  'ftres.oss-cn-beijing.aliyuncs.com': '/oss-proxy',
};

/**
 * 将 OSS URL 转换为代理 URL
 * @param {string} url - 原始 URL
 * @returns {string} 代理后的 URL（开发环境）或原始 URL（生产环境）
 *
 * @example
 * // 开发环境
 * getProxyUrl('https://ftres.oss-cn-beijing.aliyuncs.com/tmp/xxx.png')
 * // => '/oss-proxy/tmp/xxx.png'
 *
 * // 生产环境（直接返回原始 URL）
 * getProxyUrl('https://ftres.oss-cn-beijing.aliyuncs.com/tmp/xxx.png')
 * // => 'https://ftres.oss-cn-beijing.aliyuncs.com/tmp/xxx.png'
 */
export function getProxyUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // 生产环境不使用代理
  if (import.meta.env.PROD) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    const proxyPath = PROXY_MAP[urlObj.host];

    if (proxyPath) {
      // 返回代理路径 + 原始路径
      return `${proxyPath}${urlObj.pathname}${urlObj.search}`;
    }
  } catch (e) {
    // URL 解析失败，返回原始 URL
  }

  return url;
}

/**
 * 检查 URL 是否需要代理
 * @param {string} url - URL
 * @returns {boolean}
 */
export function needsProxy(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const urlObj = new URL(url);
    return urlObj.host in PROXY_MAP;
  } catch (e) {
    return false;
  }
}

/**
 * 批量转换 URL
 * @param {string[]} urls - URL 数组
 * @returns {string[]}
 */
export function getProxyUrls(urls) {
  if (!Array.isArray(urls)) return urls;
  return urls.map(getProxyUrl);
}

export default {
  getProxyUrl,
  getProxyUrls,
  needsProxy,
};
