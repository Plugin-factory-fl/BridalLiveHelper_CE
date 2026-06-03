import type { LabelPrintBatchRequest } from '../api/types'
import { getMockCatalog } from '../inventory/mock-provider'
import { getDataSource } from '../lib/data-source'
import {
  AUTO_STYLE_LAYOUT_ID,
  describeLayoutSelection,
  getLabelStyleLayout,
} from './style-layouts'
import { expandLabelLines } from './enrich'
import { pageCountForLabels } from './layout'
import { buildLabelPdf, openPdfInNewTab } from './pdf'
import { DEFAULT_SHEET, getSheetSpec } from './templates'
import type { LabelPrintBatchResult } from './types'

function layoutSummaryForRequest(
  styleLayoutId: string,
  uniqueLayoutIds: string[],
): string {
  if (styleLayoutId === AUTO_STYLE_LAYOUT_ID) {
    const names = uniqueLayoutIds
      .map((id) => getLabelStyleLayout(id)?.name ?? id)
      .filter(Boolean)
    return names.length > 0 ? `Auto (${names.join(', ')})` : 'Auto by department'
  }
  return getLabelStyleLayout(styleLayoutId)?.name ?? styleLayoutId
}

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
  const styleLayoutId = request.styleLayoutId ?? AUTO_STYLE_LAYOUT_ID

  const labels = expandLabelLines(
    request.items,
    catalog,
    styleLayoutId,
    request.fallbackDepartment,
  )
  if (labels.length === 0) {
    return {
      ok: false,
      message: 'No labels to print — add at least one item with quantity.',
      labelCount: 0,
      pageCount: 0,
    }
  }

  const uniqueLayoutIds = [...new Set(labels.map((l) => l.styleLayoutId))]
  const pdfBytes = await buildLabelPdf(labels, sheet, startRow, startCol)
  const pageCount = pageCountForLabels(
    labels.length,
    sheet,
    (startRow - 1) * sheet.columns + (startCol - 1),
  )

  const openResult = await openPdfInNewTab(pdfBytes, {
    labelCount: labels.length,
    pageCount,
    sheetName: sheet.name,
    layoutSummary: layoutSummaryForRequest(styleLayoutId, uniqueLayoutIds),
    averyStart: `Row ${startRow}, column ${startCol}`,
    generatedAt: new Date().toISOString(),
  })

  const mode =
    getDataSource() === 'mock'
      ? 'Print at 100% scale — do not use Fit to page.'
      : 'Verify alignment on a test sheet first.'

  const layoutHint =
    styleLayoutId === AUTO_STYLE_LAYOUT_ID
      ? describeLayoutSelection(styleLayoutId)
      : (getLabelStyleLayout(styleLayoutId)?.name ?? '')

  return {
    ok: true,
    labelCount: labels.length,
    pageCount,
    pdfOpened: openResult.ok,
    message: openResult.ok
      ? `Generated ${labels.length} label(s) on ${pageCount} page(s). ${layoutHint} ${mode}`
      : `Generated PDF (${labels.length} labels) but could not open tab: ${openResult.error}`,
  }
}
