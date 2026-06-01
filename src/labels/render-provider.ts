import { API_BASE_URL } from '../lib/config'
import type { LabelTemplate } from '../api/types'
import type { LabelsProvider } from './provider'
import type { ReceivingVoucherLine } from './types'

/** Phase 2: Render backend proxies BridalLive receiving + template storage. */
export const renderLabelsProvider: LabelsProvider = {
  async getReceivingLines(storeId: string): Promise<ReceivingVoucherLine[]> {
    const res = await fetch(`${API_BASE_URL}/stores/${storeId}/receiving/lines`)
    if (!res.ok) throw new Error('Failed to load receiving lines')
    return res.json() as Promise<ReceivingVoucherLine[]>
  },

  async listTemplates(storeId: string): Promise<LabelTemplate[]> {
    const res = await fetch(`${API_BASE_URL}/stores/${storeId}/label-templates`)
    if (!res.ok) throw new Error('Failed to load label templates')
    return res.json() as Promise<LabelTemplate[]>
  },
}
