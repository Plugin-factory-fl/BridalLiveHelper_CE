import type { LabelsProvider } from './provider'
import type { ReceivingVoucherLine } from './types'
import { mockLabelsProvider } from './mock-provider'
import { getReceivingVoucherLines, listReceivingVouchers } from '../lib/bridallive-receiving'

/**
 * Live BridalLive receiving vouchers via API.
 * Templates stay bundled until department assets are customized per store.
 */
export const bridalliveLabelsProvider: LabelsProvider = {
  async getReceivingLines(storeId: string): Promise<ReceivingVoucherLine[]> {
    const vouchers = await listReceivingVouchers(storeId)
    const first = vouchers[0]
    if (!first) return []
    return getReceivingVoucherLines(first.id, storeId)
  },

  async listTemplates(storeId: string) {
    return mockLabelsProvider.listTemplates(storeId)
  },
}
