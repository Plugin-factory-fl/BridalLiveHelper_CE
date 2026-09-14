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

function originalPriceAmount(payload: LabelPayload): string {
  const value = (payload.msrp || payload.price).trim()
  if (!value || value === '$—') return ''
  return value.replace(/^(MSRP|Original Price):\s*/i, '').trim()
}

function saleLabel(payload: LabelPayload): string {
  return payload.salePrice || payload.price || '$—'
}

const PRICE_BOX_H = 18
/** Slightly shorter sale box on shoe stock so name / color / size can grow. */
const PRICE_BOX_H_STOCK = 15.5
const ORIG_PRICE_SIZE = 7.5
/** Right-column space above the barcode. Do not change — barcode height depends on this. */
const BARCODE_TOP_RESERVE_H = 28
/** Store code (PLM / PK) — shared size so dress matches shoes and jewelry. */
const LOCATION_SIZE = 9
const ORIG_PRICE_GAP = 2.5

function originalPriceBlockHeight(): number {
  return ORIG_PRICE_SIZE + 2
}

/**
 * "Original Price $111.99" on one line, strike only on the amount.
 * Returns the Y just above the block so callers can stack copy on top.
 */
function drawOriginalPriceBlock(
  page: PDFPage,
  fonts: LabelDrawFonts,
  payload: LabelPayload,
  x: number,
  yBottom: number,
  w: number,
): number {
  const amount = originalPriceAmount(payload)
  const baseline = yBottom
  if (!amount) {
    drawFitted(page, 'Original Price', fonts.regular, ORIG_PRICE_SIZE, x, baseline, w, 'center', MUTED)
    return baseline + originalPriceBlockHeight()
  }

  const captions = ['Original Price ', 'Orig. '] as const
  let usedSize = ORIG_PRICE_SIZE
  let caption: string = captions[0]
  let captionW = 0
  let amountW = 0

  const fits = (label: string, size: number) => {
    const cw = fonts.regular.widthOfTextAtSize(label, size)
    const aw = fonts.regular.widthOfTextAtSize(amount, size)
    return cw + aw <= w
  }

  while (usedSize > 6 && !captions.some((label) => fits(label, usedSize))) {
    usedSize -= 0.25
  }
  caption = captions.find((label) => fits(label, usedSize)) ?? captions[1]
  captionW = fonts.regular.widthOfTextAtSize(caption, usedSize)
  amountW = fonts.regular.widthOfTextAtSize(amount, usedSize)

  const start = x + Math.max(0, (w - captionW - amountW) / 2)
  page.drawText(caption, {
    x: start,
    y: baseline,
    size: usedSize,
    font: fonts.regular,
    color: MUTED,
  })
  const amountX = start + captionW
  page.drawText(amount, {
    x: amountX,
    y: baseline,
    size: usedSize,
    font: fonts.regular,
    color: MUTED,
  })
  page.drawLine({
    start: { x: amountX - 0.3, y: baseline + usedSize * 0.35 },
    end: { x: amountX + amountW + 0.3, y: baseline + usedSize * 0.35 },
    thickness: 0.7,
    color: MUTED,
  })
  return baseline + originalPriceBlockHeight()
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
  const size = Math.min(14, Math.max(11, h * 0.75))
  const baseline = y + (h - size) / 2 + size * 0.08
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
  const itemSize = 8
  const locSize = LOCATION_SIZE
  const captionSize = 10
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
 * Vertically center location (and optional extra lines) in the existing
 * barcode-top reserve. Does not change barcode size.
 */
function drawRightReserveCopy(
  page: PDFPage,
  fonts: LabelDrawFonts,
  x: number,
  reserveY: number,
  reserveW: number,
  reserveH: number,
  loc: string,
  extraLines: string[] = [],
): void {
  const extraSize = 7.5
  const gap = 1.8
  const items: Array<{ text: string; font: LabelDrawFonts['regular']; size: number }> = []
  if (loc) items.push({ text: loc, font: fonts.bold, size: LOCATION_SIZE })
  for (const line of extraLines) {
    items.push({ text: line, font: fonts.regular, size: extraSize })
  }
  if (!items.length) return
  const blockH = items.reduce((sum, item, i) => sum + item.size + (i > 0 ? gap : 0), 0)
  let top = reserveY + (reserveH - blockH) / 2 + blockH
  for (const item of items) {
    const baseline = top - item.size
    drawFitted(page, item.text, item.font, item.size, x, baseline, reserveW, 'center')
    top = baseline - gap
  }
}

/**
 * Dress stock label (Avery 5160):
 * Left: description, original price, sale price
 * Right: size/color, barcode, item # with store code
 */
function drawStockLabel(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 2.5
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
  const sizeSize = 12.5
  const colorSize = 10.5
  const bottomPad = 3.2
  const topPad = 2.2
  drawFitted(
    page,
    payload.size || '—',
    fonts.bold,
    sizeSize,
    rightX + 2,
    sizeColorY + sizeColorH - topPad - sizeSize,
    rightW - 4,
    'center',
  )
  drawFitted(
    page,
    payload.color || '—',
    fonts.regular,
    colorSize,
    rightX + 2,
    sizeColorY + bottomPad,
    rightW - 4,
    'center',
  )

  const barcodeH = Math.max(18, sizeColorY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, rightX, y + pad, rightW, barcodeH, {
    locationCode: payload.locationCode,
  })

  const innerY = y + pad
  const innerH = h - pad * 2
  const origH = originalPriceBlockHeight() + ORIG_PRICE_GAP
  const descText = payload.description.trim()
  const descWidth = Math.max(8, leftW)
  let descSize = 10.5
  let priceBoxH = PRICE_BOX_H
  let descLines = descText
    ? descriptionLines(descText, fonts.regular, descSize, descWidth, 4)
    : []
  const stackH = () =>
    descLines.length * (descSize + 1.5) + (descLines.length ? 2 : 0) + origH + priceBoxH
  while (innerH - stackH() > 5) {
    let grew = false
    if (descText && descSize < 13) {
      descSize += 0.5
      descLines = descriptionLines(descText, fonts.regular, descSize, descWidth, 4)
      grew = true
    }
    if (innerH - stackH() > 5 && priceBoxH < 20) {
      priceBoxH += 0.5
      grew = true
    }
    if (!grew) break
  }

  const priceBoxY = innerY
  const priceBoxW = leftW - pad
  drawPriceBox(page, fonts, saleLabel(payload), x + pad, priceBoxY, priceBoxW, priceBoxH)

  const origTop = drawOriginalPriceBlock(
    page,
    fonts,
    payload,
    x + pad,
    priceBoxY + priceBoxH + ORIG_PRICE_GAP,
    priceBoxW,
  )

  if (descLines.length) {
    const descLineH = descSize + 1.5
    const descCeiling = y + h - pad
    const descFloor = origTop + 1
    const maxFit = Math.max(1, Math.floor((descCeiling - descFloor) / descLineH))
    const lines = descLines.slice(0, maxFit)
    let descY = descCeiling - descSize
    for (const line of lines) {
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
  const pad = 2.5
  const priceBoxX = x + pad
  const priceBoxW = leftW - pad * 2
  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad

  drawPriceBox(page, fonts, saleLabel(payload), priceBoxX, priceBoxY, priceBoxW, priceBoxH)

  const origTop = drawOriginalPriceBlock(
    page,
    fonts,
    payload,
    priceBoxX,
    priceBoxY + priceBoxH + ORIG_PRICE_GAP,
    priceBoxW,
  )

  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  const colorSize = 13
  const colorBaseline = origTop + 1.2
  if (colorText) {
    drawFitted(page, colorText, fonts.bold, colorSize, priceBoxX, colorBaseline, priceBoxW, 'center')
  }

  const nameFloor = (colorText ? colorBaseline + colorSize : origTop) + 1
  const nameH = Math.max(12, y + h - pad - nameFloor)
  const nameSize = Math.max(13, Math.min(16, nameH >= 28 ? 15.5 : nameH * 0.72))
  drawWrappedInBox(
    page,
    displayName(payload),
    fonts.bold,
    nameSize,
    priceBoxX,
    nameFloor,
    priceBoxW,
    nameH,
    'center',
    nameH >= nameSize + 8 ? 2 : 1,
  )

  const topRightY = y + h - pad - BARCODE_TOP_RESERVE_H
  const loc = payload.locationCode?.trim() ?? ''
  if (loc) {
    drawRightReserveCopy(
      page,
      fonts,
      x + leftW,
      topRightY,
      rightW,
      BARCODE_TOP_RESERVE_H,
      loc,
    )
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
  const pad = 2.5
  const priceBoxX = x + pad
  const priceBoxW = leftW - pad * 2
  const priceBoxH = PRICE_BOX_H
  const priceBoxY = y + pad

  drawPriceBox(page, fonts, saleLabel(payload), priceBoxX, priceBoxY, priceBoxW, priceBoxH)

  const origTop = drawOriginalPriceBlock(
    page,
    fonts,
    payload,
    priceBoxX,
    priceBoxY + priceBoxH + ORIG_PRICE_GAP,
    priceBoxW,
  )

  const nameText = shoeName(payload)
  const sizeText = payload.size && payload.size !== '—' ? payload.size : ''
  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  const descText = shoeDescription(payload, nameText)
  const sizeColorText = [sizeText, colorText].filter(Boolean).join(' · ')

  const sizeColorSize = 13
  const nameSize = maxSizeForWidth(fonts.bold, nameText, priceBoxW, 16, 9.5)
  const nameLineH = nameSize + 1.6
  const nameCeiling = y + h - pad
  const nameFloorMin = origTop + sizeColorSize + 2.5
  const nameH = Math.max(nameSize, Math.min(nameLineH * 2, nameCeiling - nameFloorMin))
  const nameFloor = nameCeiling - nameH
  const nameMaxLines =
    fonts.bold.widthOfTextAtSize(nameText.trim(), nameSize) <= priceBoxW
      ? 1
      : nameH >= nameLineH * 1.6
        ? 2
        : 1
  if (nameText) {
    drawWrappedInBox(
      page,
      nameText,
      fonts.bold,
      nameSize,
      priceBoxX,
      nameFloor,
      priceBoxW,
      nameH,
      'center',
      nameMaxLines,
    )
  }
  if (sizeColorText) {
    drawFitted(
      page,
      sizeColorText,
      fonts.bold,
      sizeColorSize,
      priceBoxX,
      nameFloor - 2 - sizeColorSize,
      priceBoxW,
      'center',
    )
  }

  const topRightH = BARCODE_TOP_RESERVE_H
  const topRightY = y + h - pad - topRightH
  const loc = payload.locationCode?.trim() ?? ''
  const extraLines = descText
    ? descriptionLines(descText, fonts.regular, 7.5, rightW - 2, 3)
    : []
  drawRightReserveCopy(page, fonts, x + leftW, topRightY, rightW, topRightH, loc, extraLines)

  const barcodeColH = Math.max(18, topRightY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, x + leftW, y + pad, rightW, barcodeColH)
}

function maxSizeForWidth(
  font: PDFFont,
  text: string,
  maxW: number,
  maxSize: number,
  minSize: number,
): number {
  const trimmed = text.trim()
  if (!trimmed) return maxSize
  for (let s = maxSize; s >= minSize; s -= 0.25) {
    if (font.widthOfTextAtSize(trimmed, s) <= maxW) return s
  }
  return minSize
}

function fitShoesStockType(
  fonts: LabelDrawFonts,
  nameText: string,
  colorText: string,
  sizeText: string,
  maxW: number,
  maxH: number,
): { nameSize: number; metaSize: number; nameLines: string[] } {
  const gap = 1.15
  const extraLines = (colorText ? 1 : 0) + (sizeText ? 1 : 0)
  const extraGaps = extraLines
  let best: { nameSize: number; metaSize: number; nameLines: string[]; balanced: number; sum: number } | null =
    null
  for (let nameSize = 18; nameSize >= 11; nameSize -= 0.5) {
    for (let metaSize = 16; metaSize >= 11; metaSize -= 0.5) {
      const nameLines = wrapWords(nameText, fonts.bold, nameSize, maxW, 2)
      const nameH =
        nameLines.length * nameSize + Math.max(0, nameLines.length - 1) * 1.1
      const metaH = extraLines * metaSize + extraGaps * gap
      if (nameH + metaH > maxH) continue
      const balanced = Math.min(nameSize, metaSize)
      const sum = nameSize + metaSize
      if (
        !best ||
        balanced > best.balanced ||
        (balanced === best.balanced && sum > best.sum)
      ) {
        best = { nameSize, metaSize, nameLines, balanced, sum }
      }
    }
  }
  return (
    best ?? {
      nameSize: 11,
      metaSize: 11,
      nameLines: wrapWords(nameText, fonts.bold, 11, maxW, 2),
    }
  )
}

function drawShoesStock(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const rightW = 58
  const leftW = w - rightW
  const pad = 2.5
  const priceBoxX = x + pad
  const priceBoxW = leftW - pad * 2
  const priceBoxH = PRICE_BOX_H_STOCK
  const priceBoxY = y + pad

  drawPriceBox(page, fonts, saleLabel(payload), priceBoxX, priceBoxY, priceBoxW, priceBoxH)

  const nameText = shoeName(payload)
  const sizeText = payload.size && payload.size !== '—' ? payload.size : ''
  const colorText = payload.color && payload.color !== '—' ? payload.color : ''
  const ceiling = y + h - pad
  const floor = priceBoxY + priceBoxH + 2.2
  const availH = Math.max(12, ceiling - floor)
  const { nameSize, metaSize, nameLines } = fitShoesStockType(
    fonts,
    nameText,
    colorText,
    sizeText,
    priceBoxW,
    availH,
  )

  const nameH = nameLines.length * nameSize + Math.max(0, nameLines.length - 1) * 1.1
  const extraLines = (colorText ? 1 : 0) + (sizeText ? 1 : 0)
  const extraGaps = extraLines
  const used = nameH + extraLines * metaSize + extraGaps * 1.15
  const leftover = Math.max(0, availH - used)
  const gap = 1.15 + leftover / Math.max(1, extraGaps)

  let baseline = ceiling - nameSize
  if (nameText) {
    drawWrappedInBox(
      page,
      nameText,
      fonts.bold,
      nameSize,
      priceBoxX,
      ceiling - nameH,
      priceBoxW,
      nameH,
      'center',
      nameLines.length,
    )
    baseline = ceiling - nameH - gap - metaSize
  }
  if (colorText) {
    drawFitted(page, colorText, fonts.bold, metaSize, priceBoxX, baseline, priceBoxW, 'center')
    baseline -= metaSize + gap
  }
  if (sizeText) {
    drawFitted(page, sizeText, fonts.bold, metaSize, priceBoxX, baseline, priceBoxW, 'center')
  }

  const topRightH = BARCODE_TOP_RESERVE_H
  const topRightY = y + h - pad - topRightH
  const loc = payload.locationCode?.trim() ?? ''
  drawRightReserveCopy(page, fonts, x + leftW, topRightY, rightW, topRightH, loc)

  const barcodeColH = Math.max(18, topRightY - 2 - (y + pad))
  drawBarcodeColumn(page, payload, fonts, x + leftW, y + pad, rightW, barcodeColH)
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
