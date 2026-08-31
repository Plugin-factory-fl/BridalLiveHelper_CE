import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import { MOCK_CATALOG_ITEMS } from './mock-catalog-items'
import { buildSaleSearchQuery } from './sale-search-query'
import type { InventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

export const MOCK_LOCATIONS = [
  { id: 'store-1', name: 'Main Boutique' },
  { id: 'store-2', name: 'Second Location' },
] as const

/** Real BL export (items.xls) + variants appended in-session until reload. */
const MOCK_ITEMS: InventoryItem[] = [...MOCK_CATALOG_ITEMS]

function normalizeQuery(query: InventorySearchQuery) {
  const name = (query.name ?? query.style)?.trim().toLowerCase() ?? ''
  return {
    locationId: query.locationId?.trim() ?? '',
    department: query.department?.trim().toLowerCase() ?? '',
    name,
    vendorItemName: query.vendorItemName?.trim().toLowerCase() ?? '',
    vendor: query.vendor?.trim().toLowerCase() ?? '',
    size: query.size?.trim() ?? '',
    color: query.color?.trim().toLowerCase() ?? '',
    itemNumber: query.itemNumber?.trim().toLowerCase() ?? '',
  }
}

function matchesItem(item: InventoryItem, q: ReturnType<typeof normalizeQuery>): boolean {
  if (q.locationId && item.locationId !== q.locationId) return false
  if (q.department && item.department.toLowerCase() !== q.department) return false
  if (q.itemNumber && !item.itemNumber.toLowerCase().includes(q.itemNumber)) return false
  if (q.name && !item.style.toLowerCase().includes(q.name)) return false
  if (q.vendorItemName && !item.vendorItemName.toLowerCase().includes(q.vendorItemName)) {
    return false
  }
  if (q.vendor && !item.vendor.toLowerCase().includes(q.vendor)) return false
  if (q.size && item.size !== q.size) return false
  if (q.color && !item.color.toLowerCase().includes(q.color)) return false
  return Object.values(q).some(Boolean)
}

export function findDuplicateWarning(
  items: InventoryItem[],
  style: string,
  size: string,
  color: string,
): string | undefined {
  const s = style.trim().toLowerCase()
  const sz = size.trim().toLowerCase()
  const c = color.trim().toLowerCase()
  if (!s || !sz || !c) return undefined

  const dup = items.find(
    (i) =>
      i.style.toLowerCase() === s &&
      i.size.trim().toLowerCase() === sz &&
      i.color.trim().toLowerCase() === c,
  )
  if (!dup) return undefined
  return `This style + size + color already exists at ${dup.locationName} as item ${dup.itemNumber} (${dup.size} / ${dup.color}).`
}

async function search(query: InventorySearchQuery): Promise<InventorySearchResult> {
  const q = normalizeQuery(query)
  const items = MOCK_ITEMS.filter((item) => matchesItem(item, q)).sort((a, b) => {
    if (a.locationId !== b.locationId) return a.locationId.localeCompare(b.locationId)
    return a.itemNumber.localeCompare(b.itemNumber)
  })
  let duplicateWarning: string | undefined
  if (q.name && q.size && q.color) {
    duplicateWarning = findDuplicateWarning(MOCK_ITEMS, q.name, q.size, q.color)
  }
  return { items, duplicateWarning }
}

async function createVariant(
  payload: InventoryCreateVariantPayload,
): Promise<InventoryCreateVariantResult> {
  if (!payload.vendorItemName?.trim()) {
    return {
      ok: false,
      message: 'Vendor item name is required.',
    }
  }

  const exists = MOCK_ITEMS.some(
    (i) =>
      i.style.toLowerCase() === payload.styleId.toLowerCase() &&
      i.size === payload.size &&
      i.color.toLowerCase() === payload.color.toLowerCase(),
  )
  if (exists) {
    const dup = findDuplicateWarning(MOCK_ITEMS, payload.styleId, payload.size, payload.color)
    return {
      ok: false,
      message: dup ?? 'Duplicate blocked: style + size + color already exists.',
    }
  }

  const source = payload.sourceItemNumber
    ? MOCK_ITEMS.find((i) => i.itemNumber === payload.sourceItemNumber)
    : undefined

  const deptPrefix =
    source?.department === 'Shoes'
      ? 'SH'
      : source?.department === 'Jewelry'
        ? 'JW'
        : 'DR'
  const itemNumber = `${deptPrefix}-${Math.floor(10000 + Math.random() * 90000)}`

  const vendor = source?.vendor ?? 'Unknown vendor'
  const newItem: InventoryItem = {
    id: `mock-${Date.now()}`,
    itemNumber,
    style: payload.styleId,
    vendorItemName: payload.vendorItemName.trim() || source?.vendorItemName || payload.styleId,
    vendor,
    vendorCode: source?.vendorCode ?? '',
    saleSearchQuery: buildSaleSearchQuery(vendor, itemNumber),
    department: source?.department ?? 'Dress',
    size: payload.size,
    color: payload.color,
    locationId: source?.locationId ?? 'store-1',
    locationName: source?.locationName ?? 'Main Boutique',
    onHand: 0,
    retailPrice: source?.retailPrice,
    salePrice: source?.salePrice,
    availableColors: source?.availableColors,
  }
  MOCK_ITEMS.push(newItem)

  let message = `Added: ${itemNumber}`
  if (source) {
    message += ` for ${source.style} (based on ${source.itemNumber})`
  }
  message += '. Sign in on Home to save new items to BridalLive.'

  return {
    ok: true,
    itemNumber,
    saleSearchQuery: newItem.saleSearchQuery,
    message,
  }
}

export const mockInventoryProvider: InventoryProvider = {
  search: async (query) => search(query),
  createVariant: async (payload) => createVariant(payload),
}

/** Exported for duplicate checks against the full mock catalog. */
export function getMockCatalog(): InventoryItem[] {
  return MOCK_ITEMS
}
