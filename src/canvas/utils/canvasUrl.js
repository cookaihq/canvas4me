export function getCanvasIdFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('canvasId') || null
}

export function updateCanvasIdInUrl(canvasId) {
  const url = new URL(window.location)
  url.searchParams.set('canvasId', canvasId)
  window.history.replaceState({}, '', url)
}
