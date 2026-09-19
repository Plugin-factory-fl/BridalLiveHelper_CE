import type { Department } from '../lib/config'
import type { LabelTemplate } from '../api/types'
import { LABEL_STYLE_LAYOUTS } from './style-layouts'

/**
 * Avery sheet geometry — US Letter, 30-up address labels.
 *
 * Public specs (Avery Template 5160; 6240 uses the same template):
 * @see https://www.avery.com/templates/5160
 * @see https://www.avery.com/products/labels/5160
 * @see https://www.avery.com/products/labels/6240
 *
 * | Property          | Spec               |
 * |-------------------|--------------------|
 * | Label size        | 2.625" × 1"        |
 * | Sheet             | 8.5" × 11" Letter  |
 * | Grid              | 3 columns × 10 rows|
 * | Top margin        | 0.5"               |
 * | Left margin       | 0.1875" (3/16")    |
 * | Vertical pitch    | 1" (labels touch)  |
 * | Horizontal pitch  | 2.75" (1/8" gap)   |
 *
 * Physical 5160 / 6240 prints sat high and clipped the top of each sticker.
 * Extra `contentInsetTopIn` keeps the top of the artwork fixed; the grid stays
 * on spec so later rows do not walk off the sheet. Bottom inset is the remaining
 * print-safe edge (skinnier than the top).
 */
export type AverySheetSpec = {
  id: string
  name: string
  /** Avery product number(s) this preset matches. */
  averyProductNumbers: string[]
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
  /** Empty space at the top of each physical label (inches). */
  contentInsetTopIn: number
  /** Empty space at the bottom of each physical label (inches). */
  contentInsetBottomIn: number
  /** Empty space on the left and right of each physical label (inches). */
  contentInsetXIn: number
}

export const AVERY_5160: AverySheetSpec = {
  id: 'avery-5160',
  name: 'Avery 5160 / 6240 (30-up)',
  averyProductNumbers: ['5160', '8160', '5260', '8460', '6240'],
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
  contentInsetTopIn: 0.11,
  contentInsetBottomIn: 0.025,
  contentInsetXIn: 0.05,
}

export const DEFAULT_SHEET = AVERY_5160

/** Legacy template list — derived from registered style layouts. */
export const MOCK_LABEL_TEMPLATES: LabelTemplate[] = LABEL_STYLE_LAYOUTS.map((layout) => ({
  id: layout.id,
  department: layout.department,
  name: layout.name,
  widthIn: AVERY_5160.labelWidthIn,
  heightIn: AVERY_5160.labelHeightIn,
}))

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
