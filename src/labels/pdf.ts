import { PDFDocument, StandardFonts } from 'pdf-lib'
import { isBridalLiveAppUrl, PDF_VIEWER_ZOOM, STORAGE_KEYS } from '../lib/config'
import { drawLabel } from './draw-label'
import type { LabelPayload } from './types'
import type { AverySheetSpec } from './templates'
import { labelsPerPage, slotPosition, startSlotIndex } from './layout'

const IN_TO_PT = 72

export async function buildLabelPdf(
  labels: LabelPayload[],
  sheet: AverySheetSpec,
  startRow = 1,
  startCol = 1,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular: font, bold: fontBold }

  let slot = startSlotIndex(sheet, startRow, startCol)
  let page = doc.addPage([sheet.pageWidthIn * IN_TO_PT, sheet.pageHeightIn * IN_TO_PT])
  const perPage = labelsPerPage(sheet)

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && slot % perPage === 0) {
      page = doc.addPage([sheet.pageWidthIn * IN_TO_PT, sheet.pageHeightIn * IN_TO_PT])
    }

    const slotOnPage = slot % perPage
    const { xIn, yIn } = slotPosition(sheet, slotOnPage)
    drawLabel(
      page,
      labels[i],
      {
        xIn,
        yIn,
        widthIn: sheet.labelWidthIn,
        heightIn: sheet.labelHeightIn,
      },
      fonts,
    )
    slot++
  }

  return doc.save()
}

export type OpenPdfResult = { ok: true; tabId?: number } | { ok: false; error: string }

async function resolveBlTabForPrint(): Promise<{ blTabId: number; windowId: number } | null> {
  const pinned = await chrome.storage.session.get(STORAGE_KEYS.helperBridalLiveTabId)
  const pinnedId = pinned[STORAGE_KEYS.helperBridalLiveTabId] as number | undefined
  if (typeof pinnedId === 'number') {
    try {
      const tab = await chrome.tabs.get(pinnedId)
      if (tab.id && tab.windowId !== undefined && tab.url && isBridalLiveAppUrl(tab.url)) {
        return { blTabId: tab.id, windowId: tab.windowId }
      }
    } catch {
      /* tab gone */
    }
  }
  return null
}

/**
 * Open PDF in a new tab at 100% zoom (Chrome's native PDF viewer).
 * Uses a blob: URL with #zoom=100 so the viewer does not fit-to-page (~95%).
 */
export async function openPdfInNewTab(pdfBytes: Uint8Array): Promise<OpenPdfResult> {
  try {
    const blTab = await resolveBlTabForPrint()
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    const blobUrl = URL.createObjectURL(blob)
    const pdfUrl = `${blobUrl}${PDF_VIEWER_ZOOM}`

    const begin = (await chrome.runtime.sendMessage({
      action: 'labels-print-preview-begin',
      blTabId: blTab?.blTabId,
      windowId: blTab?.windowId,
    })) as { ok?: boolean; error?: string }
    if (!begin?.ok) {
      URL.revokeObjectURL(blobUrl)
      return { ok: false, error: begin?.error ?? 'Could not start print preview' }
    }

    const tab = await chrome.tabs.create({ url: pdfUrl, active: false })

    if (!tab.id) {
      URL.revokeObjectURL(blobUrl)
      return { ok: false, error: 'Could not open PDF tab' }
    }

    const opened = (await chrome.runtime.sendMessage({
      action: 'labels-print-preview-opened',
      pdfTabId: tab.id,
    })) as { ok?: boolean; error?: string }
    if (!opened?.ok) {
      URL.revokeObjectURL(blobUrl)
      return { ok: false, error: opened?.error ?? 'Could not focus print preview' }
    }

    return { ok: true, tabId: tab.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open PDF tab' }
  }
}
