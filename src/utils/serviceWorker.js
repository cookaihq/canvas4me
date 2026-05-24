export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    return { supported: false }
  }

  try {
    const base = import.meta.env.BASE_URL || '/'
    const swUrl = `${base}sw.js`
    const registration = await navigator.serviceWorker.register(swUrl)
    return { supported: true, registration }
  } catch (error) {
    console.warn('[ServiceWorker] 注册失败:', error)
    return { supported: true, error }
  }
}
