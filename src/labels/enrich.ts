import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'
import type { InventoryItem } from '../types/inventory'
import type { LabelLineItem } from '../api/types'
import type { LabelPayload } from './types'
import { resolveStyleLayoutId } from './style-layouts'
import { getTemplateForDepartment } from './templates'

function guessDepartment(itemNumber: string): Department {
  const upper = itemNumber.toUpperCase()
  if (upper.startsWith('SH')) return 'Shoes'
  if (upper.startsWith('JW')) return 'Jewelry'
  return 'Dress'
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

function formatMoney(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '$—'
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Unique colors for a style: prefer Description list, else sibling catalog rows. */
function collectVariantColors(
  match: InventoryItem | undefined,
  catalog: InventoryItem[],
  chosenColor: string,
): string[] {
  if (match?.availableColors?.length) {
    return [...match.availableColors]
  }
  if (!match) {
    return chosenColor && chosenColor !== '—' ? [chosenColor] : []
  }
  const fromSiblings = [
    ...new Set(
      catalog
        .filter((i) => i.style.toLowerCase() === match.style.toLowerCase())
        .map((i) => i.color)
        .filter((c) => c && c !== '—'),
    ),
  ]
  if (fromSiblings.length) return fromSiblings
  return chosenColor && chosenColor !== '—' ? [chosenColor] : []
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
  const itemNumber = match?.itemNumber ?? line.itemNumber.trim()
  const color = line.color ?? match?.color ?? '—'
  const msrp = formatMoney(match?.retailPrice)
  const salePrice = formatMoney(
    match?.salePrice != null && match.salePrice > 0 ? match.salePrice : match?.retailPrice,
  )

  return {
    itemNumber,
    style: line.style ?? match?.style ?? 'Unknown style',
    vendor: match?.vendor ?? 'Unknown vendor',
    department,
    size: line.size ?? match?.size ?? '—',
    color,
    price: salePrice,
    msrp,
    salePrice,
    variantColors: collectVariantColors(match, catalog, color),
    barcodeValue: itemNumber,
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
