import type { LabelsProvider } from './provider'
import type { ReceivingVoucherLine } from './types'
import { mockLabelsProvider } from './mock-provider'

/**
 * Phase 2: read receiving table from BridalLive DOM while user is on voucher screen.
 * @see src/bridallive/selectors.ts
 */
export const bridalliveLabelsProvider: LabelsProvider = {
  async getReceivingLines(_storeId: string): Promise<ReceivingVoucherLine[]> {
    // TODO: scrape BL_SELECTORS.receiving from content script context
    return mockLabelsProvider.getReceivingLines(_storeId)
  },

  async listTemplates(storeId: string) {
    return mockLabelsProvider.listTemplates(storeId)
  },
}
