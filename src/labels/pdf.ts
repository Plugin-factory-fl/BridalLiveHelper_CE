import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LabelPayload } from './types'
import type { AverySheetSpec } from './templates'
import { labelsPerPage, slotPosition, startSlotIndex } from './layout'

const IN_TO_PT = 72

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

export type OpenPdfResult = { ok: true } | { ok: false; error: string }

/**
 * Open PDF in a new tab from an extension page (side panel).
 * Blob URLs created in the service worker are not readable in new tabs — keep this in the panel.
 */
export async function openPdfInNewTab(pdfBytes: Uint8Array): Promise<OpenPdfResult> {
  const blob = new Blob([Uint8Array.from(pdfBytes)], { type: 'application/pdf' })

  try {
    const url = URL.createObjectURL(blob)
    await chrome.tabs.create({ url })
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not open PDF tab'
    try {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return { ok: true }
    } catch {
      return { ok: false, error: msg }
    }
  }
}
