import type { LabelTemplate } from '../api/types'
import type { ReceivingVoucherLine } from './types'

export interface LabelsProvider {
  /** Lines on the active receiving voucher (DOM scrape in Phase 2). */
  getReceivingLines(storeId: string): Promise<ReceivingVoucherLine[]>

  /** Department templates (Render or bundled assets in Phase 2). */
  listTemplates(storeId: string): Promise<LabelTemplate[]>
}
