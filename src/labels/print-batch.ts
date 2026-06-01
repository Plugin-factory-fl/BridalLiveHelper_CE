import type { LabelPrintBatchRequest } from '../api/types'
import { getMockCatalog } from '../inventory/mock-provider'
import { getDataSource } from '../lib/data-source'
import { expandLabelLines } from './enrich'
import { pageCountForLabels } from './layout'
import { buildLabelPdf, openPdfInNewTab } from './pdf'
import { DEFAULT_SHEET, getSheetSpec } from './templates'
import type { LabelPrintBatchResult } from './types'

/**
 * Generate Avery PDF and open print tab. Runs in the side panel (not content script)
 * so pdf-lib is not injected into every BridalLive page.
 */
export async function printLabelBatch(
  request: LabelPrintBatchRequest,
): Promise<LabelPrintBatchResult> {
  if (getDataSource() === 'render') {
    const { API_BASE_URL } = await import('../lib/config')
    const res = await fetch(`${API_BASE_URL}/labels/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) throw new Error('Label print failed')
    return res.json() as Promise<LabelPrintBatchResult>
  }

  const sheet = getSheetSpec(request.sheetId ?? DEFAULT_SHEET.id)
  const catalog = getMockCatalog()
  const startRow = request.averyStartRow ?? 1
  const startCol = request.averyStartColumn ?? 1

  const labels = expandLabelLines(request.items, catalog, request.department)
  if (labels.length === 0) {
    return {
      ok: false,
      message: 'No labels to print — add at least one item with quantity.',
      labelCount: 0,
      pageCount: 0,
    }
  }

  const pdfBytes = await buildLabelPdf(labels, sheet, startRow, startCol)
  const openResult = await openPdfInNewTab(pdfBytes)
  const pageCount = pageCountForLabels(
    labels.length,
    sheet,
    (startRow - 1) * sheet.columns + (startCol - 1),
  )

  const mode =
    getDataSource() === 'mock'
      ? 'Print PDF at 100% scale on Avery 5160.'
      : 'Verify alignment on a test sheet first.'

  return {
    ok: true,
    labelCount: labels.length,
    pageCount,
    pdfOpened: openResult.ok,
    message: openResult.ok
      ? `Generated ${labels.length} label(s) on ${pageCount} page(s). ${mode}`
      : `Generated PDF (${labels.length} labels) but could not open tab: ${openResult.error}`,
  }
}
