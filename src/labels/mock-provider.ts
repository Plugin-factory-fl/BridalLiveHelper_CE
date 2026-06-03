import type { LabelTemplate } from '../api/types'
import { getMockCatalog } from '../inventory/mock-provider'
import type { LabelsProvider } from './provider'
import type { ReceivingVoucherLine } from './types'
import { enrichFromCatalog } from './enrich'
import { AUTO_STYLE_LAYOUT_ID } from './style-layouts'
import { MOCK_LABEL_TEMPLATES } from './templates'

/** Sample voucher lines — Phase 2 replaces with DOM / API scrape. */
const MOCK_VOUCHER_LINES: ReceivingVoucherLine[] = [
  { itemNumber: '49154', quantity: 2 },
  { itemNumber: '49153', quantity: 1 },
  { itemNumber: '49152', quantity: 2 },
  { itemNumber: '49151', quantity: 1 },
  { itemNumber: '49150', quantity: 3 },
]

async function getReceivingLines(): Promise<ReceivingVoucherLine[]> {
  const catalog = getMockCatalog()
  return MOCK_VOUCHER_LINES.map((line) => {
    const enriched = enrichFromCatalog(line, catalog, {
      styleLayoutSelection: AUTO_STYLE_LAYOUT_ID,
    })
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
