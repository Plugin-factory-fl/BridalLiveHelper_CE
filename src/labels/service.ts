import type { LabelTemplate } from '../api/types'
import { getLabelsProvider } from './provider-registry'
import type { ReceivingVoucherLine } from './types'

export type { ReceivingVoucherLine, LabelPrintBatchResult } from './types'

/** @deprecated Use getReceivingLines() — kept for panel import compatibility. */
export { MOCK_VOUCHER_LINES as MOCK_RECEIVING_LINES } from './mock-provider'

export async function getReceivingLines(storeId: string): Promise<ReceivingVoucherLine[]> {
  return (await getLabelsProvider()).getReceivingLines(storeId)
}

export async function listLabelTemplates(storeId: string): Promise<LabelTemplate[]> {
  return (await getLabelsProvider()).listTemplates(storeId)
}

export { printLabelBatch } from './print-batch'
