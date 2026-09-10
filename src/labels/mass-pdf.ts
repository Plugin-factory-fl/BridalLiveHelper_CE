import { PDFDocument, StandardFonts } from 'pdf-lib'
import { drawMassLabel } from './draw-mass-label'
import { labelsPerPage, slotDrawBox, startSlotIndex } from './layout'
import { disablePrintScaling } from './pdf'
import type { AverySheetSpec } from './templates'
import type { MassLabelPayload } from './mass-types'

const IN_TO_PT = 72

/** Avery 5160 PDF using BridalLive’s default tag layout, with a start–end range on page 1. */
export async function buildMassLabelPdf(
  labels: MassLabelPayload[],
  sheet: AverySheetSpec,
  startRow = 1,
  startCol = 1,
  endRow = sheet.rows,
  endCol = sheet.columns,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pageWidth = sheet.pageWidthIn * IN_TO_PT
  const pageHeight = sheet.pageHeightIn * IN_TO_PT

  const perPage = labelsPerPage(sheet)
  const firstStart = startSlotIndex(sheet, startRow, startCol)
  const firstEnd = startSlotIndex(sheet, endRow, endCol)
  const firstPageLast = Math.max(firstStart, firstEnd)

  const addPage = () => {
    const page = doc.addPage([pageWidth, pageHeight])
    page.setMediaBox(0, 0, pageWidth, pageHeight)
    page.setCropBox(0, 0, pageWidth, pageHeight)
    return page
  }

  let page = addPage()
  let isFirstPage = true
  let slot = firstStart

  for (let i = 0; i < labels.length; i++) {
    if (isFirstPage && slot > firstPageLast) {
      page = addPage()
      isFirstPage = false
      slot = 0
    } else if (!isFirstPage && i > 0 && slot % perPage === 0) {
      page = addPage()
    }

    const slotOnPage = isFirstPage ? slot : slot % perPage
    drawMassLabel(page, labels[i]!, slotDrawBox(sheet, slotOnPage), font)
    slot += 1
  }

  disablePrintScaling(doc)
  return doc.save()
}
