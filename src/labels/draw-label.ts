import type { PDFFont, PDFPage } from 'pdf-lib'
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

type Align = 'left' | 'center' | 'right'

function drawFitted(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  baseline: number,
  maxWidth: number,
  align: Align = 'left',
  color = BLACK,
): number {
  const fitted = fitText(font, text, size, maxWidth)
  if (!fitted) return 0
  const tw = font.widthOfTextAtSize(fitted, size)
  let tx = x
  if (align === 'center') tx = x + (maxWidth - tw) / 2
  if (align === 'right') tx = x + maxWidth - tw
  page.drawText(fitted, { x: tx, y: baseline, size, font, color })
  return tw
}

function drawWrappedInBox(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  align: Align,
  maxLines: number,
): void {
  const lines = wrapWords(text, font, size, w, maxLines)
  if (!lines.length) return
  const lineH = size + 1.4
  const block = lines.length * lineH
  let baseline = y + (h - block) / 2 + (lineH - size) * 0.35
  baseline += lineH * (lines.length - 1)
  for (const line of lines) {
    drawFitted(page, line, font, size, x, baseline, w, align)
    baseline -= lineH
  }
}

function drawStruck(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  baseline: number,
  maxWidth: number,
  align: Align = 'left',
): void {
  const fitted = fitText(font, text, size, maxWidth)
  if (!fitted) return
  const tw = font.widthOfTextAtSize(fitted, size)
  let tx = x
  if (align === 'center') tx = x + (maxWidth - tw) / 2
  if (align === 'right') tx = x + maxWidth - tw
  page.drawText(fitted, { x: tx, y: baseline, size, font, color: MUTED })
  page.drawLine({
    start: { x: tx - 0.4, y: baseline + size * 0.35 },
    end: { x: tx + tw + 0.4, y: baseline + size * 0.35 },
    thickness: 0.7,
    color: MUTED,
  })
}

function itemHash(payload: LabelPayload): string {
  return payload.itemNumber.trim()
}

function displayName(payload: LabelPayload): string {
  const name = payload.itemName.trim()
  if (name && name !== 'Unknown style' && name.toLowerCase() !== payload.itemNumber.trim().toLowerCase()) {
    return name
  }
  const style = payload.style.trim()
  if (style && style !== 'Unknown style' && style.toLowerCase() !== payload.itemNumber.trim().toLowerCase()) {
    return style
  }
  return name || style || payload.itemNumber
}

function msrpLabel(payload: LabelPayload): string {
  const value = payload.msrp || payload.price
  if (!value || value === '$—') return 'MSRP:'
  const trimmed = value.trim()
  if (trimmed.toUpperCase().startsWith('MSRP')) return trimmed
  return `MSRP: ${trimmed}`
}

function saleLabel(payload: LabelPayload): string {
  return payload.salePrice || payload.price || '$—'
}

const PRICE_BOX_H = 22

function drawPriceBox(
  page: PDFPage,
  fonts: LabelDrawFonts,
  price: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: BLACK,
    borderWidth: 1.1,
  })
  const size = Math.min(16, Math.max(11, h * 0.7))
  const baseline = y + (h - size) / 2 + size * 0.12
  drawFitted(page, price, fonts.bold, size, x + 2, baseline, w - 4, 'center')
}

function drawBarcodeColumn(
  page: PDFPage,
  payload: LabelPayload,
  fonts: LabelDrawFonts,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pad = 1.5
  const itemSize = 7.5
  const itemH = itemSize + 3
  const barcodeH = Math.max(14, h - itemH - pad * 2)
  const barcodeY = y + itemH + pad
  drawCode128Barcode(payload.barcodeValue || payload.itemNumber, {
    x: x + pad,
    y: barcodeY,
    width: Math.max(8, w - pad * 2),
    height: barcodeH,
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
  drawFitted(
    page,
    itemHash(payload),
    fonts.regular,
    itemSize,
    x + pad,
    y + pad + 1,
    w - pad * 2,
    'center',
  )
}

/**
 * Dress stock label (Avery 5160):
 * Left: variants, struck MSRP + location, sale price
 * Right: centered size/color, barcode with item number under it
 */
function drawStockLabel(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 2
  const midX = x + w * 0.5
  const leftW = midX - x - pad
  const rightX = midX + 1
  const rightW = x + w - pad - rightX

  const sizeColorH = 30
  const sizeColorY = y + h - pad - sizeColorH
  page.drawRectangle({
    x: rightX,
    y: sizeColorY,
    width: rightW,
    height: sizeColorH,
    borderColor: BLACK,
    borderWidth: 0.7,
  })
  const sizeSize = 11
  const colorSize = 9
  drawFitted(
    page,
    payload.size || '—',
    fonts.bold,
    sizeSize,
    rightX + 2,
    sizeColorY + sizeColorH - sizeSize - 2.2,
    rightW - 4,
    'center',
  )
  drawFitted(
    page,
    payload.color || '—',
    fonts.regular,
    colorSize,
    rightX + 2,
    sizeColorY + 3.2,
    rightW - 4,
    'center',
  )

  const barcodeH = Math.max(18, sizeColorY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, rightX, y + pad, rightW, barcodeH)

  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad
  const priceBoxW = leftW - pad
  drawPriceBox(page, fonts, saleLabel(payload), x + pad, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 10
  const locSize = 9
  const loc = payload.locationCode
  const locW = loc ? fonts.bold.widthOfTextAtSize(loc, locSize) + 3 : 0
  const msrpY = priceBoxY + priceBoxH + 4
  drawStruck(page, msrpLabel(payload), fonts.regular, msrpSize, x + pad, msrpY, leftW - locW)
  if (loc) {
    drawFitted(page, loc, fonts.bold, locSize, x + pad, msrpY, leftW, 'right')
  }

  const variantText =
    payload.variantColors.length > 0 ? payload.variantColors.join(' ') : payload.color
  const variantSize = 8
  const variantCeiling = y + h - pad
  const variantFloor = msrpY + msrpSize + 3
  const variantLineH = variantSize + 1.6
  const maxVariantLines = Math.max(1, Math.min(4, Math.floor((variantCeiling - variantFloor) / variantLineH)))
  const variantLines = wrapWords(variantText, fonts.regular, variantSize, leftW, maxVariantLines)
  let variantY = variantCeiling - variantSize
  for (const line of variantLines) {
    page.drawText(line, {
      x: x + pad,
      y: variantY,
      size: variantSize,
      font: fonts.regular,
      color: BLACK,
    })
    variantY -= variantLineH
  }
}

function drawJewelryTag(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 56
  const leftW = w - rightW
  const nameH = 29
  const bodyH = h - nameH
  const pad = 2.5

  const loc = payload.locationCode
  const locSize = 7
  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    12,
    x + pad,
    y + h - nameH,
    w - pad * 2,
    nameH,
    'center',
    2,
  )
  if (loc) {
    drawFitted(page, loc, fonts.bold, locSize, x + pad, y + h - pad - locSize, w - pad * 2, 'right')
  }

  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + 3
  const priceBoxW = leftW - 6
  drawPriceBox(page, fonts, saleLabel(payload), x + 3, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 10
  const msrpY = priceBoxY + priceBoxH + 5
  drawStruck(
    page,
    msrpLabel(payload),
    fonts.regular,
    msrpSize,
    x + 3,
    msrpY,
    priceBoxW,
    'center',
  )
  drawBarcodeColumn(page, payload, fonts, x + leftW, y, rightW, bodyH)
}

function drawShoesTag(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 56
  const leftW = w - rightW
  const topH = 26
  const bodyH = h - topH
  const pad = 2

  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  drawWrappedInBox(
    page,
    colorText,
    fonts.bold,
    13,
    x + pad,
    y + h - topH,
    w - pad * 2,
    topH,
    'center',
    2,
  )
  const loc = payload.locationCode
  if (loc) {
    drawFitted(
      page,
      loc,
      fonts.bold,
      8,
      x + pad,
      y + h - pad - 8,
      w - pad * 2,
      'right',
    )
  }

  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + 2.5
  const priceBoxW = leftW - 5
  drawPriceBox(page, fonts, saleLabel(payload), x + 2.5, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 11
  drawStruck(
    page,
    msrpLabel(payload),
    fonts.regular,
    msrpSize,
    x + 2.5,
    priceBoxY + priceBoxH + 5,
    priceBoxW,
    'center',
  )
  drawBarcodeColumn(page, payload, fonts, x + leftW, y, rightW, bodyH)
}

function drawShoesStock(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 56
  const leftW = w - rightW
  const nameH = 18
  const bodyH = h - nameH
  const rowH = bodyH / 3
  const pad = 2.5

  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    7,
    x + pad,
    y + h - nameH,
    w - pad * 2,
    nameH,
    'center',
    2,
  )

  const sizeY = y + rowH * 2 + (rowH - 7) / 2
  const loc = payload.locationCode
  const locW = loc ? fonts.bold.widthOfTextAtSize(loc, 6.5) + 3 : 0
  drawFitted(
    page,
    payload.size && payload.size !== '—' ? payload.size : '',
    fonts.regular,
    7,
    x + pad,
    sizeY,
    leftW - pad * 2 - locW,
    'center',
  )
  if (loc) {
    drawFitted(page, loc, fonts.bold, 6.5, x + pad, sizeY, leftW - pad * 2, 'right')
  }

  drawFitted(
    page,
    payload.color && payload.color !== '—' ? payload.color : '',
    fonts.regular,
    6.5,
    x + pad,
    y + rowH + (rowH - 6.5) / 2,
    leftW - pad * 2,
    'center',
  )
  drawPriceBox(page, fonts, saleLabel(payload), x + 3, y + 2.5, leftW - 6, rowH - 5)
  drawBarcodeColumn(page, payload, fonts, x + leftW, y, rightW, bodyH)
}

const DRAWERS: Record<
  string,
  (page: PDFPage, payload: LabelPayload, box: LabelDrawBox, fonts: LabelDrawFonts) => void
> = {
  'dress-classic': drawStockLabel,
  'dress-minimal': drawStockLabel,
  'shoes-tag': drawShoesTag,
  'shoes-stock': drawShoesStock,
  'shoes-standard': drawShoesTag,
  'jewelry-tag': drawJewelryTag,
  'jewelry-standard': drawJewelryTag,
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
