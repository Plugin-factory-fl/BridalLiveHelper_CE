import type { PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { LabelPayload } from './types'
import { getLabelStyleLayout } from './style-layouts'
import { drawCode128Barcode } from './barcode'

const IN_TO_PT = 72
const BLACK = rgb(0.08, 0.08, 0.1)
const MUTED = rgb(0.35, 0.32, 0.38)
const GRID = rgb(0.45, 0.43, 0.48)

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

function strokeRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  borderWidth = 0.4,
  color = GRID,
): void {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: color,
    borderWidth,
  })
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
): void {
  const fitted = fitText(font, text, size, maxWidth)
  if (!fitted) return
  page.drawText(fitted, { x, y: baseline, size, font, color: MUTED })
  const tw = font.widthOfTextAtSize(fitted, size)
  page.drawLine({
    start: { x: x - 0.4, y: baseline + size * 0.35 },
    end: { x: x + tw + 0.4, y: baseline + size * 0.35 },
    thickness: 0.7,
    color: MUTED,
  })
}

function itemHash(payload: LabelPayload): string {
  return `# ${payload.itemNumber}`
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
  if (!value || value === '$—') return 'MSRP'
  return value.toUpperCase().startsWith('MSRP') ? value : `MSRP ${value}`
}

function saleLabel(payload: LabelPayload): string {
  return payload.salePrice || payload.price || '$—'
}

function sizesInInventory(payload: LabelPayload): string {
  const sizes =
    payload.availableSizes.length > 0
      ? payload.availableSizes.join(' ')
      : payload.size && payload.size !== '—'
        ? payload.size
        : ''
  if (!sizes) return 'Sizes'
  return `Sizes ${sizes}`
}

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
  const size = Math.min(16, Math.max(11, h * 0.78))
  const baseline = y + (h - size) / 2 + 1
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
  const pad = 2
  const itemSize = 6
  const itemH = itemSize + 4
  const barcodeH = Math.max(12, h - itemH - pad * 2)
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
  strokeRect(page, x, y, w, h, 0.4, rgb(0.7, 0.68, 0.72))

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

  const sale = saleLabel(payload)
  const saleSize = 10
  page.drawText(sale, {
    x: x + pad,
    y: y + pad + 2,
    size: saleSize,
    font: fonts.bold,
    color: BLACK,
  })

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
  page.drawText(payload.size || '—', {
    x: sizeColorBoxX + boxPad,
    y: sizeColorBoxY + sizeColorBoxH - 9,
    size: 7,
    font: fonts.bold,
    color: BLACK,
    maxWidth: sizeColorBoxW - boxPad * 2,
  })
  page.drawText(payload.color || '—', {
    x: sizeColorBoxX + boxPad,
    y: sizeColorBoxY + 3.5,
    size: 5.5,
    font: fonts.regular,
    color: BLACK,
    maxWidth: sizeColorBoxW - boxPad * 2,
  })

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

function drawJewelryTag(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 56
  const leftW = w - rightW
  const nameH = 18
  const colorH = 11
  const bodyH = h - nameH - colorH
  const msrpH = Math.max(16, bodyH * 0.4)
  const priceH = bodyH - msrpH
  const pad = 2.5

  strokeRect(page, x, y, w, h, 0.5, BLACK)
  strokeRect(page, x, y + h - nameH, w, nameH)
  strokeRect(page, x, y + h - nameH - colorH, w, colorH)
  strokeRect(page, x, y + priceH, leftW, msrpH)
  strokeRect(page, x, y, leftW, priceH)
  strokeRect(page, x + leftW, y, rightW, bodyH)

  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    7.5,
    x + pad,
    y + h - nameH,
    w - pad * 2,
    nameH,
    'center',
    2,
  )
  drawFitted(
    page,
    payload.color && payload.color !== '—' ? payload.color : '',
    fonts.regular,
    6.5,
    x + pad,
    y + h - nameH - colorH + (colorH - 6.5) / 2,
    w - pad * 2,
    'center',
  )

  const msrpSize = 9.5
  const msrpY = y + priceH + (msrpH - msrpSize) / 2 + 0.5
  const loc = payload.locationCode
  const locW = loc ? fonts.bold.widthOfTextAtSize(loc, 7) + 4 : 0
  drawStruck(page, msrpLabel(payload), fonts.regular, msrpSize, x + pad, msrpY, leftW - pad * 2 - locW)
  if (loc) {
    drawFitted(page, loc, fonts.bold, 7, x + pad, msrpY, leftW - pad * 2, 'right')
  }

  drawPriceBox(page, fonts, saleLabel(payload), x + 3, y + 3, leftW - 6, priceH - 6)
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
  const sizeW = 48
  const nameW = w - sizeW
  const topH = 18
  const vendorH = 11
  const bodyH = h - topH - vendorH
  const sizesH = bodyH * 0.22
  const msrpH = bodyH * 0.32
  const priceH = bodyH - sizesH - msrpH
  const pad = 2.2

  strokeRect(page, x, y, w, h, 0.5, BLACK)
  strokeRect(page, x, y + h - topH, nameW, topH)
  strokeRect(page, x + nameW, y + h - topH, sizeW, topH)
  strokeRect(page, x, y + h - topH - vendorH, w, vendorH)
  strokeRect(page, x, y + priceH + msrpH, leftW, sizesH)
  strokeRect(page, x, y + priceH, leftW, msrpH)
  strokeRect(page, x, y, leftW, priceH)
  strokeRect(page, x + leftW, y, rightW, bodyH)

  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    7,
    x + pad,
    y + h - topH,
    nameW - pad * 2,
    topH,
    'left',
    2,
  )
  drawFitted(
    page,
    payload.size && payload.size !== '—' ? payload.size : '',
    fonts.regular,
    6.5,
    x + nameW + pad,
    y + h - topH + (topH - 6.5) / 2,
    sizeW - pad * 2,
    'center',
  )
  drawFitted(
    page,
    payload.vendor && payload.vendor !== 'Unknown vendor' ? payload.vendor : '',
    fonts.regular,
    6.5,
    x + pad,
    y + h - topH - vendorH + (vendorH - 6.5) / 2,
    w - pad * 2,
    'left',
  )

  const sizesY = y + priceH + msrpH + (sizesH - 6) / 2
  const loc = payload.locationCode
  const locW = loc ? fonts.bold.widthOfTextAtSize(loc, 6.5) + 3 : 0
  drawFitted(
    page,
    sizesInInventory(payload),
    fonts.regular,
    5.5,
    x + pad,
    sizesY,
    leftW - pad * 2 - locW,
    'left',
  )
  if (loc) {
    drawFitted(page, loc, fonts.bold, 6.5, x + pad, sizesY, leftW - pad * 2, 'right')
  }

  const msrpSize = 9.5
  drawStruck(
    page,
    msrpLabel(payload),
    fonts.regular,
    msrpSize,
    x + pad,
    y + priceH + (msrpH - msrpSize) / 2,
    leftW - pad * 2,
  )
  drawPriceBox(page, fonts, saleLabel(payload), x + 2.5, y + 2.5, leftW - 5, priceH - 5)
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

  strokeRect(page, x, y, w, h, 0.5, BLACK)
  strokeRect(page, x, y + h - nameH, w, nameH)
  strokeRect(page, x, y + rowH * 2, leftW, rowH)
  strokeRect(page, x, y + rowH, leftW, rowH)
  strokeRect(page, x, y, leftW, rowH)
  strokeRect(page, x + leftW, y, rightW, bodyH)

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
