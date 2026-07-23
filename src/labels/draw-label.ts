import type { PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { LabelPayload } from './types'
import { getLabelStyleLayout } from './style-layouts'
import { drawCode128Barcode } from './barcode'

const IN_TO_PT = 72
const BLACK = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.35, 0.32, 0.38)

export type LabelDrawFonts = {
  regular: Awaited<ReturnType<import('pdf-lib').PDFDocument['embedFont']>>
  bold: Awaited<ReturnType<import('pdf-lib').PDFDocument['embedFont']>>
}

export type LabelDrawBox = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

function boxToPt(box: LabelDrawBox) {
  return {
    x: box.xIn * IN_TO_PT,
    y: box.yIn * IN_TO_PT,
    w: box.widthIn * IN_TO_PT,
    h: box.heightIn * IN_TO_PT,
  }
}

function drawBorder(page: PDFPage, box: LabelDrawBox): void {
  const { x, y, w, h } = boxToPt(box)
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: rgb(0.7, 0.68, 0.72),
    borderWidth: 0.4,
  })
}

function wrapWords(
  text: string,
  font: LabelDrawFonts['regular'],
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1]!
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, '')}…`.trim()
  }
  return lines
}

/**
 * Ricky’s stock label (Avery 5160):
 * TL variants · ML MSRP (struck) · BL sale price
 * TR size/color · MR barcode · BR item #
 */
function drawStockLabel(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 3.5
  const midX = x + w * 0.52
  const rightW = w - (midX - x) - pad
  drawBorder(page, box)

  // --- Top left: all colors / variants ---
  const variantText =
    payload.variantColors.length > 0 ? payload.variantColors.join(' ') : payload.color
  const variantSize = 5.5
  const variantLines = wrapWords(variantText, fonts.regular, variantSize, midX - x - pad * 2, 3)
  let variantY = y + h - pad - variantSize
  for (const line of variantLines) {
    page.drawText(line, {
      x: x + pad,
      y: variantY,
      size: variantSize,
      font: fonts.regular,
      color: BLACK,
    })
    variantY -= variantSize + 1.5
  }

  // --- Middle left: MSRP with strikethrough ---
  const msrp = payload.msrp || payload.price
  const msrpSize = 7
  const msrpY = y + h * 0.42
  page.drawText(msrp, {
    x: x + pad,
    y: msrpY,
    size: msrpSize,
    font: fonts.regular,
    color: MUTED,
  })
  const msrpW = fonts.regular.widthOfTextAtSize(msrp, msrpSize)
  page.drawLine({
    start: { x: x + pad - 0.5, y: msrpY + msrpSize * 0.35 },
    end: { x: x + pad + msrpW + 0.5, y: msrpY + msrpSize * 0.35 },
    thickness: 0.7,
    color: MUTED,
  })

  // --- Bottom left: sale price (larger, no strike) ---
  const sale = payload.salePrice || payload.price
  const saleSize = 10
  page.drawText(sale, {
    x: x + pad,
    y: y + pad + 2,
    size: saleSize,
    font: fonts.bold,
    color: BLACK,
  })

  // --- Top right: chosen size + color (boxed) ---
  const boxPad = 2
  const sizeColorBoxW = Math.min(rightW, 58)
  const sizeColorBoxH = 22
  const sizeColorBoxX = x + w - pad - sizeColorBoxW
  const sizeColorBoxY = y + h - pad - sizeColorBoxH
  page.drawRectangle({
    x: sizeColorBoxX,
    y: sizeColorBoxY,
    width: sizeColorBoxW,
    height: sizeColorBoxH,
    borderColor: BLACK,
    borderWidth: 0.6,
  })
  const sizeText = payload.size || '—'
  const colorText = payload.color || '—'
  page.drawText(sizeText, {
    x: sizeColorBoxX + boxPad,
    y: sizeColorBoxY + sizeColorBoxH - 9,
    size: 7,
    font: fonts.bold,
    color: BLACK,
    maxWidth: sizeColorBoxW - boxPad * 2,
  })
  page.drawText(colorText, {
    x: sizeColorBoxX + boxPad,
    y: sizeColorBoxY + 3.5,
    size: 5.5,
    font: fonts.regular,
    color: BLACK,
    maxWidth: sizeColorBoxW - boxPad * 2,
  })

  // --- Middle right: barcode ---
  const barcodeH = 18
  const barcodeY = y + h * 0.28
  const barcodeX = midX
  const barcodeW = x + w - pad - barcodeX
  drawCode128Barcode(payload.barcodeValue || payload.itemNumber, {
    x: barcodeX,
    y: barcodeY,
    width: barcodeW,
    height: barcodeH,
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

  // --- Bottom right: item number ---
  const itemLabel = `Item # ${payload.itemNumber}`
  const itemSize = 6
  const itemW = fonts.regular.widthOfTextAtSize(itemLabel, itemSize)
  page.drawText(itemLabel, {
    x: Math.max(midX, x + w - pad - itemW),
    y: y + pad + 2,
    size: itemSize,
    font: fonts.regular,
    color: BLACK,
  })
}

const DRAWERS: Record<
  string,
  (page: PDFPage, payload: LabelPayload, box: LabelDrawBox, fonts: LabelDrawFonts) => void
> = {
  'dress-classic': drawStockLabel,
  'dress-minimal': drawStockLabel,
  'shoes-standard': drawStockLabel,
  'jewelry-standard': drawStockLabel,
}

/**
 * Draw one label using the layout id on the payload.
 * Unknown ids fall back to dress-classic (Ricky stock label).
 */
export function drawLabel(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const drawer = DRAWERS[payload.styleLayoutId] ?? DRAWERS['dress-classic']
  drawer(page, payload, box, fonts)
}

/** Human-readable layout name for print preview metadata. */
export function layoutDisplayName(layoutId: string): string {
  return getLabelStyleLayout(layoutId)?.name ?? layoutId
}
