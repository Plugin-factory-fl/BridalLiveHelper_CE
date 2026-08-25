import type { PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import { drawCode128Barcode } from './barcode'
import type { MassLabelPayload } from './mass-types'

const IN_TO_PT = 72
const BLACK = rgb(0, 0, 0)
const FONT_SIZE = 8
const ORIG_SIZE = 8
const LINE_GAP = 12
const TITLE_GAP = 16
const ORIG_GAP = 8

/**
 * Inner offsets from BridalLive’s default 5160 product tag
 * relative to the Avery Word slot origin.
 */
const TEXT_X = 9.5
const COL2_X = 59.78
const FIRST_BASELINE = 56
const BARCODE_X = 115
const BAR_Y = 18.037
const BAR_H = 17.1
const BARCODE_W = 60.04
const NAME_MAX = 101.5
const COL1_MAX = 46.28
const COL2_MAX = 55

export type MassLabelDrawBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

function fitText(font: PDFFont, value: string, size: number, maxWidth: number): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (font.widthOfTextAtSize(trimmed, size) <= maxWidth) return trimmed
  let cut = trimmed
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

function drawLine(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  font: PDFFont,
  maxWidth: number,
  size = FONT_SIZE,
): void {
  const text = fitText(font, value, size, maxWidth)
  if (!text) return
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: BLACK,
  })
}

/**
 * Item Name                              [barcode]
 * Dept          Vendor
 * Color
 * Size          $sale
 *               orig:$retail
 */
export function drawMassLabel(
  page: PDFPage,
  payload: MassLabelPayload,
  box: MassLabelDrawBox,
  font: PDFFont,
): void {
  const x = box.xIn * IN_TO_PT
  const y = box.yIn * IN_TO_PT
  const left = x + TEXT_X
  const col2 = x + COL2_X
  const line1 = y + FIRST_BASELINE
  const line2 = line1 - TITLE_GAP
  const line3 = line2 - LINE_GAP
  const line4 = line3 - LINE_GAP
  const origY = line4 - ORIG_GAP

  drawLine(page, payload.itemName, left, line1, font, NAME_MAX)
  drawLine(page, payload.deptCode, left, line2, font, COL1_MAX)
  drawLine(page, payload.vendorCode, col2, line2, font, COL2_MAX)
  drawLine(page, payload.color, left, line3, font, NAME_MAX)
  drawLine(page, payload.size, left, line4, font, COL1_MAX)
  drawLine(page, payload.salePrice, col2, line4, font, COL2_MAX)
  drawLine(page, payload.origPrice, col2, origY, font, COL2_MAX, ORIG_SIZE)

  drawCode128Barcode(payload.barcodeValue || payload.itemNumber, {
    x: x + BARCODE_X,
    y: y + BAR_Y,
    width: BARCODE_W,
    height: BAR_H,
    quietModules: 0,
    fillRect: (rx, ry, rw, rh) => {
      page.drawRectangle({
        x: rx,
        y: ry,
        width: Math.max(0.35, rw),
        height: rh,
        color: BLACK,
      })
    },
  })
}
