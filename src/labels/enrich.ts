import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'
import type { InventoryItem } from '../types/inventory'
import type { LabelLineItem } from '../api/types'
import type { LabelPayload } from './types'
import { resolveStyleLayoutId } from './style-layouts'
import { getTemplateForDepartment } from './templates'

const MOCK_PRICES: Record<string, string> = {
  DR: '$1,299',
  SH: '$89',
  JW: '$245',
}

function guessDepartment(itemNumber: string): Department {
  const upper = itemNumber.toUpperCase()
  if (upper.startsWith('SH')) return 'Shoes'
  if (upper.startsWith('JW')) return 'Jewelry'
  return 'Dress'
}

function mockPriceForItem(itemNumber: string): string {
  const prefix = itemNumber.split('-')[0]?.toUpperCase() ?? 'DR'
  return MOCK_PRICES[prefix] ?? '$—'
}

function asDepartment(value: string | undefined, fallback: Department): Department {
  if (value && (DEPARTMENTS as readonly string[]).includes(value)) {
    return value as Department
  }
  return fallback
}

function lineDepartment(
  line: LabelLineItem,
  match: InventoryItem | undefined,
  fallback?: Department,
): Department {
  const base = fallback ?? guessDepartment(line.itemNumber)
  return asDepartment(line.department ?? match?.department, base)
}

export function enrichFromCatalog(
  line: LabelLineItem,
  catalog: InventoryItem[],
  options: {
    styleLayoutSelection: string
    fallbackDepartment?: Department
  },
): LabelPayload {
  const match = catalog.find(
    (i) => i.itemNumber.toLowerCase() === line.itemNumber.trim().toLowerCase(),
  )

  const department = lineDepartment(line, match, options.fallbackDepartment)
  const styleLayoutId = resolveStyleLayoutId(options.styleLayoutSelection, department)

  return {
    itemNumber: match?.itemNumber ?? line.itemNumber.trim(),
    style: line.style ?? match?.style ?? 'Unknown style',
    vendor: match?.vendor ?? 'Unknown vendor',
    department,
    size: line.size ?? match?.size ?? '—',
    color: line.color ?? match?.color ?? '—',
    price: mockPriceForItem(match?.itemNumber ?? line.itemNumber),
    styleLayoutId,
  }
}

/** Expand line quantities into one record per physical label. */
export function expandLabelLines(
  lines: LabelLineItem[],
  catalog: InventoryItem[],
  styleLayoutSelection: string,
  fallbackDepartment?: Department,
): LabelPayload[] {
  const out: LabelPayload[] = []
  for (const line of lines) {
    const qty = Math.max(1, Math.floor(line.quantity) || 1)
    const payload = enrichFromCatalog(line, catalog, {
      styleLayoutSelection,
      fallbackDepartment,
    })
    for (let i = 0; i < qty; i++) {
      out.push({ ...payload })
    }
  }
  return out
}

export function templateNameForPayload(payload: LabelPayload): string {
  return getTemplateForDepartment(payload.department).name
}
