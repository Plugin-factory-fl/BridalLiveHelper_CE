import type { AverySheetSpec } from './templates'

export type GridSlot = {
  row: number
  col: number
  index: number
}

/** Convert 1-based Avery start row/col to first slot index (player sheet. */
export function startSlotIndex(
  sheet: AverySheetSpec,
  startRow = 1,
  startCol = 1,
): number {
  const row = Math.min(Math.max(1, startRow), sheet.rows)
  const col = Math.min(Math.max(1, startCol), sheet.columns)
  return (row - 1) * sheet.columns + (col - 1)
}

export function slotPosition(
  sheet: AverySheetSpec,
  slotIndex: number,
): { xIn: number; yIn: number; row: number; col: number } {
  const row = Math.floor(slotIndex / sheet.columns)
  const col = slotIndex % sheet.columns
  const xIn = sheet.marginLeftIn + col * sheet.horizontalPitchIn
  const yIn = sheet.pageHeightIn - sheet.marginTopIn - (row + 1) * sheet.verticalPitchIn
  return { xIn, yIn, row: row + 1, col: col + 1 }
}

export function labelsPerPage(sheet: AverySheetSpec): number {
  return sheet.columns * sheet.rows
}

export function pageCountForLabels(labelCount: number, sheet: AverySheetSpec, startIndex = 0): number {
  const capacityFirstPage = labelsPerPage(sheet) - startIndex
  if (labelCount <= capacityFirstPage) return 1
  const remaining = labelCount - capacityFirstPage
  return 1 + Math.ceil(remaining / labelsPerPage(sheet))
}

export function allGridSlots(sheet: AverySheetSpec): GridSlot[] {
  const slots: GridSlot[] = []
  for (let r = 1; r <= sheet.rows; r++) {
    for (let c = 1; c <= sheet.columns; c++) {
      slots.push({ row: r, col: c, index: (r - 1) * sheet.columns + (c - 1) })
    }
  }
  return slots
}
