import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'

/** Pick layout per receiving line based on each line's department. */
export const AUTO_STYLE_LAYOUT_ID = 'auto-by-department'

export type LabelStyleLayoutStatus = 'client'

export type LabelStyleLayout = {
  id: string
  department: Department
  name: string
  /** Short staff-facing description shown in the panel. */
  description: string
  /** Fields printed on this layout (for preview card). */
  fields: string[]
  status: LabelStyleLayoutStatus
  /** Preview from `drawLabel` (`public/tags/…`). Regenerate with `npm run preview:tags`. */
  previewImage?: string
}

const DRESS_FIELDS = [
  'Description',
  'Original Price (strikethrough)',
  'Sale price',
  'Store code',
  'Size + color',
  'Barcode',
  'Item #',
]

const JEWELRY_FIELDS = [
  'Item name',
  'Color',
  'Original Price (strikethrough)',
  'Store code',
  'Sale price',
  'Barcode',
  'Item #',
]

const SHOES_FIELDS = [
  'Name',
  'Size + color',
  'Original Price (strikethrough)',
  'Sale price',
  'Store code',
  'Description',
  'Barcode',
  'Item #',
]

export const LABEL_STYLE_LAYOUTS: LabelStyleLayout[] = [
  {
    id: 'dress-classic',
    department: 'Dress',
    name: 'Dress — stock',
    description:
      'Description top-left, original price and sale price; size/color, barcode, item # and store code on the right.',
    fields: DRESS_FIELDS,
    status: 'client',
    previewImage: 'tags/dress.png',
  },
  {
    id: 'shoes-tag',
    department: 'Shoes',
    name: 'Shoes',
    description:
      'Product name with size and color on one line over original price and a price box; location and description above a dress-height barcode.',
    fields: SHOES_FIELDS,
    status: 'client',
    previewImage: 'tags/shoes.png',
  },
  {
    id: 'shoes-stock',
    department: 'Shoes',
    name: 'Shoes — stock',
    description:
      'Product name with size and color on one line over original price and a price box; location and description above a dress-height barcode.',
    fields: SHOES_FIELDS,
    status: 'client',
    previewImage: 'tags/shoes-stock.png',
  },
  {
    id: 'jewelry-tag',
    department: 'Jewelry',
    name: 'Jewelry',
    description:
      'Name and color centered over the price box; location above a dress-height barcode.',
    fields: JEWELRY_FIELDS,
    status: 'client',
    previewImage: 'tags/jewelry.png',
  },
]

const DEFAULT_BY_DEPARTMENT: Record<Department, string> = {
  Dress: 'dress-classic',
  Shoes: 'shoes-tag',
  Jewelry: 'jewelry-tag',
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

const LEGACY_LAYOUT_IDS: Record<string, string> = {
  'dress-minimal': 'dress-classic',
  'shoes-standard': 'shoes-tag',
  'jewelry-standard': 'jewelry-tag',
}

/** Map saved picker values onto current layout ids. */
export function migrateStyleLayoutId(id: string | undefined): string {
  if (!id) return AUTO_STYLE_LAYOUT_ID
  if (id === AUTO_STYLE_LAYOUT_ID) return id
  const next = LEGACY_LAYOUT_IDS[id] ?? id
  return getLabelStyleLayout(next) ? next : AUTO_STYLE_LAYOUT_ID
}

/** Layouts used when Design is Auto (one per department). */
export function autoDepartmentLayouts(): LabelStyleLayout[] {
  const layouts: LabelStyleLayout[] = []
  for (const dept of DEPARTMENTS) {
    const layout = getLabelStyleLayout(DEFAULT_BY_DEPARTMENT[dept])
    if (layout) layouts.push(layout)
  }
  return layouts
}

/** Resolve which drawer to use for one label. */
export function resolveStyleLayoutId(
  selection: string,
  lineDepartment: Department,
): string {
  const resolved = migrateStyleLayoutId(selection)
  if (resolved === AUTO_STYLE_LAYOUT_ID) {
    return getDefaultLayoutIdForDepartment(lineDepartment)
  }
  return resolved
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

export function layoutOptionsHtml(selected = AUTO_STYLE_LAYOUT_ID): string {
  const groups = new Map<string, ReturnType<typeof layoutOptionsForDropdown>>()
  for (const opt of layoutOptionsForDropdown()) {
    const list = groups.get(opt.group) ?? []
    list.push(opt)
    groups.set(opt.group, list)
  }
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return [...groups.entries()]
    .map(
      ([group, opts]) =>
        `<optgroup label="${escape(group)}">${opts
          .map(
            (o) =>
              `<option value="${escape(o.value)}"${o.value === selected ? ' selected' : ''}>${escape(o.label)}</option>`,
          )
          .join('')}</optgroup>`,
    )
    .join('')
}

export function tagPreviewUrl(path: string | undefined): string {
  if (!path) return ''
  return chrome.runtime.getURL(path)
}
