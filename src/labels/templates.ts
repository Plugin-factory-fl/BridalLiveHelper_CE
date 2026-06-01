import type { Department } from '../lib/config'
import type { LabelTemplate } from '../api/types'

/** Avery 5160 / 8160 — 30 labels, 3×10 on US Letter (placeholder until client confirms SKU). */
export type AverySheetSpec = {
  id: string
  name: string
  pageWidthIn: number
  pageHeightIn: number
  columns: number
  rows: number
  labelWidthIn: number
  labelHeightIn: number
  marginTopIn: number
  marginLeftIn: number
  horizontalPitchIn: number
  verticalPitchIn: number
}

export const AVERY_5160: AverySheetSpec = {
  id: 'avery-5160',
  name: 'Avery 5160 / 8160 (30-up)',
  pageWidthIn: 8.5,
  pageHeightIn: 11,
  columns: 3,
  rows: 10,
  labelWidthIn: 2.625,
  labelHeightIn: 1,
  marginTopIn: 0.5,
  marginLeftIn: 0.1875,
  horizontalPitchIn: 2.75,
  verticalPitchIn: 1,
}

export const DEFAULT_SHEET = AVERY_5160

/** Placeholder layouts — Phase 2 replaces with client-supplied designs. */
export const MOCK_LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: 'tpl-dress',
    department: 'Dress',
    name: 'Dress tag (mock)',
    widthIn: 2.625,
    heightIn: 1,
  },
  {
    id: 'tpl-shoes',
    department: 'Shoes',
    name: 'Shoes tag (mock)',
    widthIn: 2.625,
    heightIn: 1,
  },
  {
    id: 'tpl-jewelry',
    department: 'Jewelry',
    name: 'Jewelry tag (mock)',
    widthIn: 2.625,
    heightIn: 1,
  },
]

export function getTemplateForDepartment(department: Department): LabelTemplate {
  return (
    MOCK_LABEL_TEMPLATES.find((t) => t.department === department) ??
    MOCK_LABEL_TEMPLATES[0]
  )
}

export function getSheetSpec(sheetId?: string): AverySheetSpec {
  if (sheetId === AVERY_5160.id) return AVERY_5160
  return DEFAULT_SHEET
}
