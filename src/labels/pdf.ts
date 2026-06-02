import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { isBridalLiveAppUrl, STORAGE_KEYS } from '../lib/config'
import type { LabelPayload } from './types'
import type { AverySheetSpec } from './templates'
import { labelsPerPage, slotPosition, startSlotIndex } from './layout'

const IN_TO_PT = 72
const PDF_VIEWER_PATH = 'src/pdf-viewer/index.html'

function departmentAccent(department: string): ReturnType<typeof rgb> {
  switch (department) {
    case 'Shoes':
      return rgb(0.2, 0.35, 0.55)
    case 'Jewelry':
      return rgb(0.45, 0.35, 0.15)
    default:
      return rgb(0.48, 0.31, 0.54)
  }
}

function drawMockLabel(
  page: ReturnType<PDFDocument['addPage']>,
  payload: LabelPayload,
  xIn: number,
  yIn: number,
  widthIn: number,
  heightIn: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  const x = xIn * IN_TO_PT
  const y = yIn * IN_TO_PT
  const w = widthIn * IN_TO_PT
  const h = heightIn * IN_TO_PT
  const pad = 4

  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: rgb(0.75, 0.72, 0.78),
    borderWidth: 0.5,
  })

  page.drawRectangle({
    x: x + 1,
    y: y + h - 10,
    width: w - 2,
    height: 9,
    color: departmentAccent(payload.department),
  })

  page.drawText(payload.department.toUpperCase(), {
    x: x + pad,
    y: y + h - 8,
    size: 5,
    font: fontBold,
    color: rgb(1, 1, 1),
  })

  page.drawText(payload.style, {
    x: x + pad,
    y: y + h - 22,
    size: 9,
    font: fontBold,
    color: rgb(0.15, 0.12, 0.18),
    maxWidth: w - pad * 2,
  })

  page.drawText(`${payload.size} / ${payload.color}`, {
    x: x + pad,
    y: y + h - 34,
    size: 7,
    font,
    color: rgb(0.35, 0.3, 0.38),
  })

  page.drawText(payload.itemNumber, {
    x: x + pad,
    y: y + 14,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  })

  page.drawText(payload.price, {
    x: x + w - pad - 36,
    y: y + 14,
    size: 8,
    font: fontBold,
    color: rgb(0.2, 0.45, 0.28),
  })

  page.drawText(payload.vendor, {
    x: x + pad,
    y: y + 4,
    size: 5,
    font,
    color: rgb(0.5, 0.45, 0.52),
    maxWidth: w - pad * 2,
  })
}

export async function buildLabelPdf(
  labels: LabelPayload[],
  sheet: AverySheetSpec,
  startRow = 1,
  startCol = 1,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  let slot = startSlotIndex(sheet, startRow, startCol)
  let page = doc.addPage([sheet.pageWidthIn * IN_TO_PT, sheet.pageHeightIn * IN_TO_PT])
  const perPage = labelsPerPage(sheet)

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && slot % perPage === 0) {
      page = doc.addPage([sheet.pageWidthIn * IN_TO_PT, sheet.pageHeightIn * IN_TO_PT])
    }

    const slotOnPage = slot % perPage
    const { xIn, yIn } = slotPosition(sheet, slotOnPage)
    drawMockLabel(
      page,
      labels[i],
      xIn,
      yIn,
      sheet.labelWidthIn,
      sheet.labelHeightIn,
      font,
      fontBold,
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
 * Open PDF on an extension print-preview page (not a blob: tab).
 * Blob tabs cannot host the side panel — Chrome closes it on tab switch.
 */
export async function openPdfInNewTab(pdfBytes: Uint8Array): Promise<OpenPdfResult> {
  try {
    const blTab = await resolveBlTabForPrint()
    await chrome.storage.session.set({
      [STORAGE_KEYS.helperPrintPdfBytes]: Array.from(pdfBytes),
    })

    const begin = (await chrome.runtime.sendMessage({
      action: 'labels-print-preview-begin',
      blTabId: blTab?.blTabId,
      windowId: blTab?.windowId,
    })) as { ok?: boolean; error?: string }
    if (!begin?.ok) {
      return { ok: false, error: begin?.error ?? 'Could not start print preview' }
    }

    const viewerUrl = chrome.runtime.getURL(PDF_VIEWER_PATH)
    const tab = await chrome.tabs.create({ url: viewerUrl, active: false })

    if (!tab.id) {
      return { ok: false, error: 'Could not open PDF tab' }
    }

    const opened = (await chrome.runtime.sendMessage({
      action: 'labels-print-preview-opened',
      pdfTabId: tab.id,
    })) as { ok?: boolean; error?: string }
    if (!opened?.ok) {
      return { ok: false, error: opened?.error ?? 'Could not focus print preview' }
    }

    return { ok: true, tabId: tab.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open PDF tab' }
  }
}
