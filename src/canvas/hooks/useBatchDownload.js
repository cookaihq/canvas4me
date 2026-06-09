import { useCallback } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { message } from 'antd'
import { useCanvasFacade } from '../state/canvasFacade'
import { isOutputNodeType } from '../registry/nodeTypes'
import { collectDownloadables, buildDownloadFileNames } from '../utils/groupDownload'
import { fetchMediaBlob } from '../utils/mediaCache/fetchMediaBlob'

/** 多选批量下载:收集选中产物 → 抓 blob → zip → 下载。部分失败跳过+提示。 */
export default function useBatchDownload() {
  const facade = useCanvasFacade()

  const downloadSelected = useCallback(async () => {
    const nodes = facade.getNodes()
    const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id))
    const items = collectDownloadables(nodes, selectedIds, { isOutputNodeType })
    if (items.length === 0) { message.info('无可下载产物'); return }

    const named = buildDownloadFileNames(items)
    const zip = new JSZip()
    let ok = 0, fail = 0
    const hide = message.loading(`正在打包 ${named.length} 个文件…`, 0)
    try {
      await Promise.all(named.map(async ({ url, fileName }) => {
        try { zip.file(fileName, await fetchMediaBlob(url)); ok++ }
        catch { fail++ }
      }))
      if (ok === 0) { hide(); message.error('全部文件抓取失败（可能跨域/已失效）'); return }
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `canvas-download-${ok}.zip`)
      hide()
      message.success(fail ? `已打包 ${ok} 个，${fail} 个失败跳过` : `已打包 ${ok} 个文件`)
    } catch (e) {
      hide(); message.error('打包失败')
    }
  }, [facade])

  return { downloadSelected }
}
