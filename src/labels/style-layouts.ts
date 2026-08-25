import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'

/** Pick layout per receiving line based on each line's department. */
export const AUTO_STYLE_LAYOUT_ID = 'auto-by-department'

export type LabelStyleLayoutStatus = 'placeholder' | 'client'

export type LabelStyleLayout = {
  id: string
  department: Department
  name: string
  /** Short staff-facing description shown in the panel. */
  description: string
  /** Fields printed on this layout (for preview card). */
  fields: string[]
  status: LabelStyleLayoutStatus
}

const STOCK_FIELDS = [
  'All colors / variants',
  'MSRP (strikethrough)',
  'Sale price',
  'Size + color',
  'Barcode',
  'Item #',
]

/**
 * Ricky's label designs register here.
 * To add a client design: add an entry + implement its drawer in `draw-label.ts`.
 */
export const LABEL_STYLE_LAYOUTS: LabelStyleLayout[] = [
  {
    id: 'dress-classic',
    department: 'Dress',
    name: 'Stock label',
    description:
      'Variants top-left, MSRP struck + sale price bottom-left; size/color, barcode, and item # on the right.',
    fields: STOCK_FIELDS,
    status: 'client',
  },
  {
    id: 'dress-minimal',
    department: 'Dress',
    name: 'Stock label (Dress alt)',
    description: 'Same stock layout as Dress — Classic.',
    fields: STOCK_FIELDS,
    status: 'client',
  },
  {
    id: 'shoes-standard',
    department: 'Shoes',
    name: 'Stock label',
    description: 'Same six-region stock layout used for dresses.',
    fields: STOCK_FIELDS,
    status: 'client',
  },
  {
    id: 'jewelry-standard',
    department: 'Jewelry',
    name: 'Stock label',
    description: 'Same six-region stock layout used for dresses.',
    fields: STOCK_FIELDS,
    status: 'client',
  },
]

const DEFAULT_BY_DEPARTMENT: Record<Department, string> = {
  Dress: 'dress-classic',
  Shoes: 'shoes-standard',
  Jewelry: 'jewelry-standard',
}

export function listLabelStyleLayouts(): LabelStyleLayout[] {
  return [...LABEL_STYLE_LAYOUTS]
}

export function getLabelStyleLayout(id: string): LabelStyleLayout | undefined {
  return LABEL_STYLE_LAYOUTS.find((l) => l.id === id)
}

export function getDefaultLayoutIdForDepartment(department: Department): string {
  return DEFAULT_BY_DEPARTMENT[department] ?? DEFAULT_BY_DEPARTMENT.Dress
}

/** Resolve which drawer to use for one label. */
export function resolveStyleLayoutId(
  selection: string,
  lineDepartment: Department,
): string {
  if (selection === AUTO_STYLE_LAYOUT_ID) {
    return getDefaultLayoutIdForDepartment(lineDepartment)
  }
  const layout = getLabelStyleLayout(selection)
  if (layout) return layout.id
  return getDefaultLayoutIdForDepartment(lineDepartment)
}

export function layoutOptionsForDropdown(): Array<{
  value: string
  label: string
  group: string
}> {
  const options: Array<{ value: string; label: string; group: string }> = [
    {
      value: AUTO_STYLE_LAYOUT_ID,
      label: 'Auto — match dresses, shoes, and jewelry',
      group: 'Recommended',
    },
  ]
  for (const dept of DEPARTMENTS) {
    for (const layout of LABEL_STYLE_LAYOUTS.filter((l) => l.department === dept)) {
      options.push({
        value: layout.id,
        label: layout.name,
        group: dept,
      })
    }
  }
  return options
}

export function describeLayoutSelection(selection: string): string {
  if (selection === AUTO_STYLE_LAYOUT_ID) {
    return 'Each label uses the default layout for its line department (Dress, Shoes, or Jewelry).'
  }
  const layout = getLabelStyleLayout(selection)
  if (!layout) return ''
  return layout.description
}
