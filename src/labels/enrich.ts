import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'
import type { InventoryItem } from '../types/inventory'
import type { LabelLineItem } from '../api/types'
import type { LabelPayload } from './types'
import { resolveStyleLayoutId } from './style-layouts'
import { getTemplateForDepartment } from './templates'
import { locationShorthand } from '../lib/location-code'

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
  const base = fallback ?? guessDepartment(line.itemNumber || match?.itemNumber || '')
  return asDepartment(line.department ?? match?.department, base)
}

function formatMoney(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '$—'
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function looksLikeItemNumber(value: string, itemNumber: string): boolean {
  const text = value.trim()
  if (!text || !itemNumber.trim()) return !text
  if (sameKey(text, itemNumber)) return true
  return sameKey(text.replace(/^#\s*/, ''), itemNumber)
}

function isVariantList(value: string): boolean {
  const text = value.trim()
  return /^(colors?|sizes?)\s*:/i.test(text) || /\|\s*sizes?\s*:/i.test(text)
}

/** Prefer a real product name over the item # / vendor SKU. */
function pickDescriptiveName(
  itemNumber: string,
  candidates: Array<string | undefined>,
): string {
  const cleaned = candidates.map((c) => (c ?? '').trim()).filter(Boolean)
  const named = cleaned.find((c) => !looksLikeItemNumber(c, itemNumber) && !isVariantList(c))
  if (named) return named
  return cleaned[0] || itemNumber
}

function findCatalogMatch(
  line: LabelLineItem,
  catalog: InventoryItem[],
): InventoryItem | undefined {
  const itemNumber = line.itemNumber?.trim().toLowerCase()
  if (itemNumber) {
    const byNumber = catalog.find((i) => i.itemNumber.toLowerCase() === itemNumber)
    if (byNumber) return byNumber
  }

  const vendorName = line.vendorItemName?.trim().toLowerCase()
  if (vendorName) {
    const vendorMatches = catalog.filter(
      (i) => i.vendorItemName.trim().toLowerCase() === vendorName,
    )
    if (vendorMatches.length === 1) return vendorMatches[0]

    if (line.size || line.color) {
      const sized = vendorMatches.find(
        (i) =>
          (!line.size || i.size.trim().toLowerCase() === line.size.trim().toLowerCase()) &&
          (!line.color || i.color.trim().toLowerCase() === line.color.trim().toLowerCase()),
      )
      if (sized) return sized
    }
  }

  return undefined
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

function collectVariantSizes(
  match: InventoryItem | undefined,
  catalog: InventoryItem[],
  chosenSize: string,
): string[] {
  if (!match) {
    return chosenSize && chosenSize !== '—' ? [chosenSize] : []
  }
  const fromSiblings = [
    ...new Set(
      catalog
        .filter((i) => i.style.toLowerCase() === match.style.toLowerCase())
        .map((i) => i.size)
        .filter((s) => s && s !== '—'),
    ),
  ]
  if (fromSiblings.length) return fromSiblings
  return chosenSize && chosenSize !== '—' ? [chosenSize] : []
}

export function enrichFromCatalog(
  line: LabelLineItem,
  catalog: InventoryItem[],
  options: {
    styleLayoutSelection: string
    fallbackDepartment?: Department
  },
): LabelPayload {
  const match = findCatalogMatch(line, catalog)

  const department = lineDepartment(line, match, options.fallbackDepartment)
  const styleLayoutId = resolveStyleLayoutId(options.styleLayoutSelection, department)
  const itemNumber = match?.itemNumber ?? line.itemNumber.trim()
  const color = line.color ?? match?.color ?? '—'
  const size = line.size ?? match?.size ?? '—'
  const retail = line.retailPrice ?? match?.retailPrice
  const sale = line.salePrice ?? match?.salePrice
  const msrp = formatMoney(retail)
  const salePrice = formatMoney(sale != null && sale > 0 ? sale : retail)

  const itemName = pickDescriptiveName(itemNumber, [
    match?.description,
    line.style,
    match?.style,
    line.vendorItemName,
    match?.vendorItemName,
  ])

  return {
    itemNumber,
    style: line.style ?? match?.style ?? 'Unknown style',
    itemName,
    description: (match?.description ?? '').trim(),
    vendor: match?.vendor ?? 'Unknown vendor',
    department,
    size,
    color,
    price: salePrice,
    msrp,
    salePrice,
    variantColors: collectVariantColors(match, catalog, color),
    availableSizes: collectVariantSizes(match, catalog, size),
    locationCode: locationShorthand(match?.locationName ?? ''),
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
