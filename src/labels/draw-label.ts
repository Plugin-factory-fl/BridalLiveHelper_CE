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
  const words = text
    .replace(/\s*,\s*/g, ', ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length || maxLines < 1) return []

  const lines: string[] = []
  let current = ''
  let overflow = false

  const pushLine = (line: string) => {
    if (!line || lines.length >= maxLines) return
    const fits = font.widthOfTextAtSize(line, size) <= maxWidth
    lines.push(fits ? line : fitText(font, line, size, maxWidth))
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (lines.length >= maxLines) {
      overflow = true
      break
    }
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next
      continue
    }
    if (current) {
      pushLine(current)
      current = ''
    }
    if (lines.length >= maxLines) {
      overflow = true
      break
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      continue
    }
    pushLine(word)
    current = ''
    if (i < words.length - 1) overflow = true
  }
  if (current && lines.length < maxLines) pushLine(current)
  else if (current) overflow = true

  if (overflow && lines.length) {
    const last = lines[lines.length - 1]!.replace(/…$/, '')
    let cut = last
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
      cut = cut.slice(0, -1)
    }
    lines[lines.length - 1] = `${cut}…`
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
/** Right-column space above the barcode on dress, shoe, and jewelry tags. */
const BARCODE_TOP_RESERVE_H = 30
/** Store code (PLM / PK) — shared size so dress matches shoes and jewelry. */
const LOCATION_SIZE = 9

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

function isColorsCaption(text: string): boolean {
  return /^(colors?)\s*:/i.test(text.trim())
}

function shoeName(payload: LabelPayload): string {
  const desc = payload.description.trim()
  const color = (payload.color ?? '').trim().toLowerCase()
  const itemNumber = payload.itemNumber.trim().toLowerCase()
  if (
    desc &&
    !isColorsCaption(desc) &&
    desc.includes('-') &&
    desc.toLowerCase() !== color &&
    desc.toLowerCase() !== itemNumber
  ) {
    return desc
  }
  const name = payload.itemName.trim()
  if (
    name &&
    !isColorsCaption(name) &&
    name.toLowerCase() !== itemNumber &&
    name.toLowerCase() !== color
  ) {
    return name
  }
  const style = payload.style.trim()
  if (style && style !== 'Unknown style' && !isColorsCaption(style)) return style
  return name || style || payload.itemNumber
}

function shoeDescription(payload: LabelPayload, productName: string): string {
  const desc = payload.description.trim()
  if (!desc) return ''
  if (desc.toLowerCase() === productName.trim().toLowerCase()) return ''
  return desc
}

function descriptionLines(
  text: string,
  font: LabelDrawFonts['regular'],
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const parts = text
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length <= 1) return wrapWords(text, font, size, maxWidth, maxLines)

  const lines: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const remaining = maxLines - lines.length
    if (remaining <= 0) {
      if (lines.length) {
        const last = lines[lines.length - 1]!.replace(/…$/, '')
        let cut = last
        while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
          cut = cut.slice(0, -1)
        }
        lines[lines.length - 1] = `${cut}…`
      }
      break
    }
    lines.push(...wrapWords(parts[i]!, font, size, maxWidth, remaining))
  }
  return lines.slice(0, maxLines)
}

function drawBarcodeColumn(
  page: PDFPage,
  payload: LabelPayload,
  fonts: LabelDrawFonts,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: {
    locationCode?: string
    locationAtTop?: boolean
    locationLeftOfBarcode?: boolean
    captionAbove?: string
  },
): void {
  const pad = 1.5
  const itemSize = 7.5
  const locSize = LOCATION_SIZE
  const captionSize = 9.5
  const loc = opts?.locationCode?.trim() ?? ''
  const locAtTop = Boolean(opts?.locationAtTop && loc)
  const locLeft = Boolean(opts?.locationLeftOfBarcode && loc)
  const caption = opts?.captionAbove?.trim() ?? ''
  const itemLabel = `# ${itemHash(payload)}`
  const locOnItemLine = Boolean(loc && !locAtTop && !locLeft)
  const itemH = Math.max(itemSize, locOnItemLine ? locSize : itemSize) + 3
  const topH = (caption ? captionSize + 4 : 0) + (locAtTop ? locSize + 3 : 0)
  const barcodeH = Math.max(12, h - itemH - topH - pad * 2)
  const barcodeY = y + itemH + pad
  const locGutter = locLeft ? Math.max(16, fonts.regular.widthOfTextAtSize(loc, locSize) + 3) : 0
  const barcodeX = x + pad + locGutter
  const barcodeW = Math.max(8, w - pad * 2 - locGutter)
  drawCode128Barcode(payload.barcodeValue || payload.itemNumber, {
    x: barcodeX,
    y: barcodeY,
    width: barcodeW,
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
  if (locLeft) {
    drawFitted(
      page,
      loc,
      fonts.regular,
      locSize,
      x + pad,
      barcodeY + barcodeH - locSize,
      locGutter - 1,
      'left',
    )
  }
  let topBaseline = y + h - pad - (locAtTop ? locSize : captionSize)
  if (locAtTop) {
    drawFitted(page, loc, fonts.regular, locSize, x + pad, topBaseline, w - pad * 2, 'left')
    topBaseline -= locSize + 3
  }
  if (caption) {
    drawFitted(
      page,
      caption,
      fonts.bold,
      captionSize,
      x + pad,
      locAtTop ? topBaseline : y + h - pad - captionSize,
      w - pad * 2,
      'center',
    )
  }
  const itemBaseline = y + pad + 1
  if (locOnItemLine) {
    const locW = fonts.bold.widthOfTextAtSize(loc, locSize) + 3
    drawFitted(
      page,
      itemLabel,
      fonts.regular,
      itemSize,
      x + pad,
      itemBaseline,
      w - pad * 2 - locW,
      'center',
    )
    drawFitted(page, loc, fonts.bold, locSize, x + pad, itemBaseline, w - pad * 2, 'right')
  } else {
    drawFitted(
      page,
      itemLabel,
      fonts.regular,
      itemSize,
      locLeft ? barcodeX : x + pad,
      itemBaseline,
      locLeft ? barcodeW : w - pad * 2,
      'center',
    )
  }
}

/**
 * Dress stock label (Avery 5160):
 * Left: description, struck MSRP, sale price
 * Right: size/color, barcode, item # with store code
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

  const sizeColorH = BARCODE_TOP_RESERVE_H
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
  drawBarcodeColumn(page, payload, fonts, rightX, y + pad, rightW, barcodeH, {
    locationCode: payload.locationCode,
  })

  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad
  const priceBoxW = leftW - pad
  drawPriceBox(page, fonts, saleLabel(payload), x + pad, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 10
  const msrpY = priceBoxY + priceBoxH + 4
  drawStruck(page, msrpLabel(payload), fonts.regular, msrpSize, x + pad, msrpY, priceBoxW, 'center')

  const descText = payload.description.trim()
  if (descText) {
    const descSize = 8
    const descWidth = Math.max(8, leftW)
    const descCeiling = y + h - pad
    const descFloor = msrpY + msrpSize + 3
    const descLineH = descSize + 1.6
    const maxDescLines = Math.max(1, Math.min(4, Math.floor((descCeiling - descFloor) / descLineH)))
    const descLines = descriptionLines(descText, fonts.regular, descSize, descWidth, maxDescLines)
    let descY = descCeiling - descSize
    for (const line of descLines) {
      drawFitted(page, line, fonts.regular, descSize, x + pad, descY, descWidth, 'left')
      descY -= descLineH
    }
  }
}

function drawJewelryTag(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 58
  const leftW = w - rightW
  const pad = 2
  const priceBoxX = x + pad
  const priceBoxW = leftW - pad * 2
  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad

  drawPriceBox(page, fonts, saleLabel(payload), priceBoxX, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 10
  const msrpY = priceBoxY + priceBoxH + 5
  drawStruck(
    page,
    msrpLabel(payload),
    fonts.regular,
    msrpSize,
    priceBoxX,
    msrpY,
    priceBoxW,
    'center',
  )

  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  const colorSize = 11
  const colorBaseline = msrpY + msrpSize + 3
  if (colorText) {
    drawFitted(page, colorText, fonts.bold, colorSize, priceBoxX, colorBaseline, priceBoxW, 'center')
  }

  const nameFloor = (colorText ? colorBaseline + colorSize : msrpY + msrpSize) + 1
  const nameH = Math.max(10, y + h - pad - nameFloor)
  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    12,
    priceBoxX,
    nameFloor,
    priceBoxW,
    nameH,
    'center',
    nameH >= 24 ? 2 : 1,
  )

  const topRightY = y + h - pad - BARCODE_TOP_RESERVE_H
  const loc = payload.locationCode
  if (loc) {
    const locBaseline = y + h - pad - LOCATION_SIZE - 1
    drawFitted(page, loc, fonts.bold, LOCATION_SIZE, x + leftW, locBaseline, rightW, 'center')
  }

  const barcodeColH = Math.max(18, topRightY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, x + leftW, y + pad, rightW, barcodeColH)
}

function drawShoesTag(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 58
  const leftW = w - rightW
  const pad = 2
  const priceBoxX = x + pad
  const priceBoxW = leftW - pad * 2
  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad

  drawPriceBox(page, fonts, saleLabel(payload), priceBoxX, priceBoxY, priceBoxW, priceBoxH)

  const msrpSize = 9
  const msrpY = priceBoxY + priceBoxH + 3
  drawStruck(
    page,
    msrpLabel(payload),
    fonts.regular,
    msrpSize,
    priceBoxX,
    msrpY,
    priceBoxW,
    'center',
  )

  const nameText = shoeName(payload)
  const sizeText = payload.size && payload.size !== '—' ? payload.size : ''
  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  const descText = shoeDescription(payload, nameText)

  const sizeSize = 10
  const colorSize = 11
  const gap = 1.5
  const colorBaseline = msrpY + msrpSize + gap + 1
  const sizeBaseline = colorBaseline + colorSize + gap

  if (nameText) {
    const nameFloor = (sizeText ? sizeBaseline + sizeSize : colorBaseline + colorSize) + 1
    const nameH = Math.max(8, y + h - pad - nameFloor)
    drawWrappedInBox(page, nameText, fonts.bold, 8, priceBoxX, nameFloor, priceBoxW, nameH, 'center', 1)
  }
  if (sizeText) {
    drawFitted(page, sizeText, fonts.bold, sizeSize, priceBoxX, sizeBaseline, priceBoxW, 'center')
  }
  if (colorText) {
    drawFitted(page, colorText, fonts.bold, colorSize, priceBoxX, colorBaseline, priceBoxW, 'center')
  }

  const topRightH = BARCODE_TOP_RESERVE_H
  const topRightY = y + h - pad - topRightH
  const loc = payload.locationCode
  const locBaseline = y + h - pad - LOCATION_SIZE - 1
  if (loc) {
    drawFitted(page, loc, fonts.bold, LOCATION_SIZE, x + leftW, locBaseline, rightW, 'center')
  }
  if (descText) {
    const descSize = 6
    const descLineH = descSize + 1.4
    const descWidth = rightW - 2
    const lines = descriptionLines(descText, fonts.regular, descSize, descWidth, 3)
    let descBaseline = (loc ? locBaseline - 2.5 : y + h - pad - 1) - descSize
    const minBaseline = topRightY + 0.5
    for (const line of lines) {
      if (descBaseline < minBaseline) break
      drawFitted(page, line, fonts.regular, descSize, x + leftW + 1, descBaseline, descWidth, 'center')
      descBaseline -= descLineH
    }
  }

  const barcodeColH = Math.max(18, topRightY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, x + leftW, y + pad, rightW, barcodeColH)
}

function drawShoesStock(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  drawShoesTag(page, payload, box, fonts)
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
