import type { PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { LabelPayload } from './types'
import { getLabelStyleLayout } from './style-layouts'

const IN_TO_PT = 72

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
    borderColor: rgb(0.75, 0.72, 0.78),
    borderWidth: 0.5,
  })
}

/** Dress — Classic tag (placeholder for Ricky's dress design). */
function drawDressClassic(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 4
  drawBorder(page, box)

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
    font: fonts.bold,
    color: rgb(1, 1, 1),
  })

  page.drawText(payload.style, {
    x: x + pad,
    y: y + h - 22,
    size: 9,
    font: fonts.bold,
    color: rgb(0.15, 0.12, 0.18),
    maxWidth: w - pad * 2,
  })

  page.drawText(`${payload.size} / ${payload.color}`, {
    x: x + pad,
    y: y + h - 34,
    size: 7,
    font: fonts.regular,
    color: rgb(0.35, 0.3, 0.38),
  })

  page.drawText(payload.itemNumber, {
    x: x + pad,
    y: y + 14,
    size: 8,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.12),
  })

  page.drawText(payload.price, {
    x: x + w - pad - 36,
    y: y + 14,
    size: 8,
    font: fonts.bold,
    color: rgb(0.2, 0.45, 0.28),
  })

  page.drawText(payload.vendor, {
    x: x + pad,
    y: y + 4,
    size: 5,
    font: fonts.regular,
    color: rgb(0.5, 0.45, 0.52),
    maxWidth: w - pad * 2,
  })
}

/** Dress — Minimal (placeholder). */
function drawDressMinimal(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 5
  drawBorder(page, box)

  page.drawText(payload.style, {
    x: x + pad,
    y: y + h - 18,
    size: 10,
    font: fonts.bold,
    color: rgb(0.12, 0.1, 0.14),
    maxWidth: w - pad * 2,
  })

  page.drawText(`${payload.size} · ${payload.color}`, {
    x: x + pad,
    y: y + h - 30,
    size: 7,
    font: fonts.regular,
    color: rgb(0.4, 0.35, 0.42),
  })

  page.drawText(payload.itemNumber, {
    x: x + pad,
    y: y + 12,
    size: 9,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.12),
  })

  page.drawText(payload.price, {
    x: x + w - pad - 40,
    y: y + 12,
    size: 9,
    font: fonts.bold,
    color: rgb(0.2, 0.45, 0.28),
  })
}

/** Shoes — Standard (placeholder). */
function drawShoesStandard(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 4
  drawBorder(page, box)

  page.drawText(payload.itemNumber, {
    x: x + pad,
    y: y + h - 16,
    size: 10,
    font: fonts.bold,
    color: rgb(0.15, 0.2, 0.35),
  })

  page.drawText(payload.style, {
    x: x + pad,
    y: y + h - 28,
    size: 7,
    font: fonts.regular,
    color: rgb(0.3, 0.28, 0.32),
    maxWidth: w - pad * 2,
  })

  page.drawText(`Size ${payload.size}`, {
    x: x + pad,
    y: y + 14,
    size: 8,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.12),
  })

  page.drawText(payload.price, {
    x: x + w - pad - 36,
    y: y + 14,
    size: 8,
    font: fonts.bold,
    color: rgb(0.2, 0.45, 0.28),
  })
}

/** Jewelry — Standard (placeholder). */
function drawJewelryStandard(
  page: PDFPage,
  payload: LabelPayload,
  box: LabelDrawBox,
  fonts: LabelDrawFonts,
): void {
  const { x, y, w, h } = boxToPt(box)
  const pad = 4
  drawBorder(page, box)

  page.drawText(payload.price, {
    x: x + pad,
    y: y + h - 18,
    size: 11,
    font: fonts.bold,
    color: rgb(0.35, 0.28, 0.12),
  })

  page.drawText(payload.style, {
    x: x + pad,
    y: y + h - 30,
    size: 7,
    font: fonts.regular,
    color: rgb(0.35, 0.3, 0.38),
    maxWidth: w - pad * 2,
  })

  page.drawText(payload.itemNumber, {
    x: x + pad,
    y: y + 12,
    size: 7,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.12),
  })

  page.drawText(payload.color, {
    x: x + w - pad - 48,
    y: y + 12,
    size: 7,
    font: fonts.regular,
    color: rgb(0.45, 0.4, 0.48),
  })
}

const DRAWERS: Record<
  string,
  (page: PDFPage, payload: LabelPayload, box: LabelDrawBox, fonts: LabelDrawFonts) => void
> = {
  'dress-classic': drawDressClassic,
  'dress-minimal': drawDressMinimal,
  'shoes-standard': drawShoesStandard,
  'jewelry-standard': drawJewelryStandard,
}

/**
 * Draw one label using the layout id on the payload.
 * Unknown ids fall back to dress-classic.
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
