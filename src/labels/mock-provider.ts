import type { LabelTemplate } from '../api/types'
import { getMockCatalog } from '../inventory/mock-provider'
import type { LabelsProvider } from './provider'
import type { ReceivingVoucherLine } from './types'
import { enrichFromCatalog } from './enrich'
import { MOCK_LABEL_TEMPLATES } from './templates'

/** Sample voucher lines — Phase 2 replaces with DOM / API scrape. */
const MOCK_VOUCHER_LINES: ReceivingVoucherLine[] = [
  { itemNumber: 'DR-10042', quantity: 2 },
  { itemNumber: 'DR-10043', quantity: 1 },
  { itemNumber: 'DR-10045', quantity: 2 },
  { itemNumber: 'SH-22001', quantity: 3 },
  { itemNumber: 'JW-33001', quantity: 1 },
]

async function getReceivingLines(): Promise<ReceivingVoucherLine[]> {
  const catalog = getMockCatalog()
  return MOCK_VOUCHER_LINES.map((line) => {
    const enriched = enrichFromCatalog(line, catalog)
    return {
      ...line,
      style: enriched.style,
      department: enriched.department,
      size: enriched.size,
      color: enriched.color,
      selected: true,
    }
  })
}

async function listTemplates(): Promise<LabelTemplate[]> {
  return [...MOCK_LABEL_TEMPLATES]
}

export const mockLabelsProvider: LabelsProvider = {
  getReceivingLines: async () => getReceivingLines(),
  listTemplates: async () => listTemplates(),
}

export { MOCK_VOUCHER_LINES }
