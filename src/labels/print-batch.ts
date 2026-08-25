import type { LabelPrintBatchRequest } from '../api/types'
import { resolveDataSource } from '../lib/data-source'
import {
  AUTO_STYLE_LAYOUT_ID,
  describeLayoutSelection,
  getLabelStyleLayout,
} from './style-layouts'
import { expandLabelLines } from './enrich'
import { loadCatalogForLabelPrint } from './lookup'
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
  const source = await resolveDataSource()
  if (source === 'render') {
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
  const catalog = await loadCatalogForLabelPrint(request.items)
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

  // Guard: live reprint should not print placeholder prices when lookup failed.
  if (source === 'bridallive') {
    const unresolved = labels.filter(
      (l) => !l.itemNumber || l.style === 'Unknown style' || l.msrp === '$—',
    )
    if (unresolved.length === labels.length) {
      return {
        ok: false,
        message:
          'Could not load item details from BridalLive for this label. Sign in on Home and pick your working location.',
        labelCount: 0,
        pageCount: 0,
      }
    }
  }

  const pdfBytes = await buildLabelPdf(labels, sheet, startRow, startCol)
  const pageCount = pageCountForLabels(
    labels.length,
    sheet,
    (startRow - 1) * sheet.columns + (startCol - 1),
  )

  const openResult = await openPdfInNewTab(pdfBytes)

  const mode =
    source === 'mock'
      ? 'Print at 100% scale — do not use Fit to page.'
      : 'Prices and sizes loaded from BridalLive. Print at 100% scale — do not use Fit to page.'

  const layoutHint =
    styleLayoutId === AUTO_STYLE_LAYOUT_ID
      ? describeLayoutSelection(styleLayoutId)
      : (getLabelStyleLayout(styleLayoutId)?.name ?? '')

  const sample = labels[0]
  const detailHint = sample
    ? ` ${sample.itemNumber} · ${sample.size}/${sample.color} · ${sample.salePrice}.`
    : ''

  return {
    ok: true,
    labelCount: labels.length,
    pageCount,
    pdfOpened: openResult.ok,
    message: openResult.ok
      ? `Generated ${labels.length} label(s) on ${pageCount} page(s).${detailHint} ${layoutHint} ${mode}`
      : `Generated PDF (${labels.length} labels) but could not open tab: ${openResult.error}`,
  }
}
