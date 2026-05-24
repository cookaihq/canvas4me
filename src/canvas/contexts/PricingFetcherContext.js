import { createContext, useContext } from 'react'

/**
 * 拉取 capability pricing 元数据的 fetcher 注入点。
 *
 * - 装饰层(CanvasShell)在画布外层包 PricingFetcherProvider,注入真实
 *   fetcher(走 apiClient)
 *   useCapabilityCredits 早返回全 null → panel 现有 `totalCredits != null && ...`
 *   兜底自动隐藏积分块
 *
 * fetcher 签名:(modelId: string) => Promise<PricingData | null>
 *   PricingData = {
 *     model_price: number,
 *     model_ratio: number,
 *     billing_mode: string,
 *     unit_label: string,
 *     // ...
 *   }
 *
 * 详见 CLAUDE.md §装饰层解耦原则。
 */
export const PricingFetcherContext = createContext(null)

export function usePricingFetcher() {
  return useContext(PricingFetcherContext)
}
