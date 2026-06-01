import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import type { InventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

/** In-memory catalog for MVP demos; new variants are appended until reload. */
const MOCK_ITEMS: InventoryItem[] = [
  {
    id: '1',
    itemNumber: 'DR-10042',
    style: 'Iris',
    vendor: 'Sample Designer',
    department: 'Dress',
    size: '6',
    color: 'Light Pink',
    onHand: 0,
  },
  {
    id: '2',
    itemNumber: 'DR-10043',
    style: 'Iris',
    vendor: 'Sample Designer',
    department: 'Dress',
    size: '8',
    color: 'Light Pink',
    onHand: 1,
  },
  {
    id: '3',
    itemNumber: 'DR-10044',
    style: 'Iris',
    vendor: 'Sample Designer',
    department: 'Dress',
    size: '10',
    color: 'Ivory',
    onHand: 0,
  },
  {
    id: '4',
    itemNumber: 'DR-10045',
    style: 'Iris',
    vendor: 'Sample Designer',
    department: 'Dress',
    size: '12',
    color: 'Champagne',
    onHand: 2,
  },
  {
    id: '5',
    itemNumber: 'SH-22001',
    style: 'Bella',
    vendor: 'Shoe Co',
    department: 'Shoes',
    size: '8',
    color: 'Ivory',
    onHand: 2,
  },
  {
    id: '6',
    itemNumber: 'SH-22002',
    style: 'Bella',
    vendor: 'Shoe Co',
    department: 'Shoes',
    size: '9',
    color: 'Ivory',
    onHand: 1,
  },
  {
    id: '7',
    itemNumber: 'JW-33001',
    style: 'Luna Pendant',
    vendor: 'Gem Artisans',
    department: 'Jewelry',
    size: 'OS',
    color: 'Silver',
    onHand: 4,
  },
]

function normalizeQuery(query: InventorySearchQuery) {
  return {
    style: query.style?.trim().toLowerCase() ?? '',
    vendor: query.vendor?.trim().toLowerCase() ?? '',
    size: query.size?.trim() ?? '',
    color: query.color?.trim().toLowerCase() ?? '',
    itemNumber: query.itemNumber?.trim().toLowerCase() ?? '',
  }
}

function matchesItem(item: InventoryItem, q: ReturnType<typeof normalizeQuery>): boolean {
  if (q.itemNumber && !item.itemNumber.toLowerCase().includes(q.itemNumber)) return false
  if (q.style && !item.style.toLowerCase().includes(q.style)) return false
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
  const sz = size.trim()
  const c = color.trim().toLowerCase()
  if (!s || !sz || !c) return undefined

  const dup = items.find(
    (i) =>
      i.style.toLowerCase() === s &&
      i.size === sz &&
      i.color.toLowerCase() === c,
  )
  if (!dup) return undefined
  return `Variant already exists: ${dup.itemNumber} (${dup.size} / ${dup.color})`
}

async function search(query: InventorySearchQuery): Promise<InventorySearchResult> {
  const q = normalizeQuery(query)
  const items = MOCK_ITEMS.filter((item) => matchesItem(item, q))
  let duplicateWarning: string | undefined
  if (q.style && q.size && q.color) {
    duplicateWarning = findDuplicateWarning(MOCK_ITEMS, q.style, q.size, q.color)
  }
  return { items, duplicateWarning }
}

async function createVariant(
  payload: InventoryCreateVariantPayload,
): Promise<InventoryCreateVariantResult> {
  const exists = MOCK_ITEMS.some(
    (i) =>
      i.style.toLowerCase() === payload.styleId.toLowerCase() &&
      i.size === payload.size &&
      i.color.toLowerCase() === payload.color.toLowerCase(),
  )
  if (exists) {
    return { ok: false, message: 'Duplicate blocked: style + size + color already exists.' }
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

  const newItem: InventoryItem = {
    id: `mock-${Date.now()}`,
    itemNumber,
    style: payload.styleId,
    vendor: source?.vendor ?? 'Unknown vendor',
    department: source?.department ?? 'Dress',
    size: payload.size,
    color: payload.color,
    onHand: 0,
  }
  MOCK_ITEMS.push(newItem)

  let message = `Mock variant created: ${itemNumber}`
  if (source) {
    message += ` (cloned vendor/department from ${source.itemNumber})`
  } else if (payload.sourceItemNumber) {
    message += ` (source ${payload.sourceItemNumber} not found — using defaults)`
  }
  message += '. Phase 2 will persist via BridalLive API.'

  return { ok: true, itemNumber, message }
}

export const mockInventoryProvider: InventoryProvider = {
  search: async (query) => search(query),
  createVariant: async (payload) => createVariant(payload),
}

/** Exported for duplicate checks against the full mock catalog. */
export function getMockCatalog(): InventoryItem[] {
  return MOCK_ITEMS
}
