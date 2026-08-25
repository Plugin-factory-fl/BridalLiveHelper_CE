import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import { bridalLiveFetch } from '../lib/bridallive-auth'
import {
  DEFAULT_BRIDALLIVE_LOCATIONS,
  type BridalLiveLocationCredentials,
} from '../lib/bridallive-credentials'
import {
  buildVariantCreateBody,
  formatItemNumber,
  mapBridalLiveItem,
  type BridalLiveItem,
  type BridalLiveItemListResult,
} from '../lib/bridallive-item-map'
import { findDuplicateWarning } from './mock-provider'
import type { InventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

const PAGE_SIZE = 500
const MAX_PAGES = 10

function normalizeQuery(query: InventorySearchQuery) {
  const name = (query.name ?? query.style)?.trim() ?? ''
  return {
    locationId: query.locationId?.trim() ?? '',
    department: query.department?.trim() ?? '',
    name,
    vendorItemName: query.vendorItemName?.trim() ?? '',
    vendor: query.vendor?.trim() ?? '',
    size: query.size?.trim() ?? '',
    color: query.color?.trim() ?? '',
    itemNumber: query.itemNumber?.trim() ?? '',
  }
}

function buildListFilter(q: ReturnType<typeof normalizeQuery>): BridalLiveItem {
  const filter: BridalLiveItem = {}
  if (q.name) filter.name = q.name
  if (q.vendorItemName) filter.vendorItemName = q.vendorItemName
  if (q.vendor) filter.vendorName = q.vendor
  if (q.size) filter.size = q.size
  if (q.color) filter.color = q.color
  if (q.department) filter.departmentName = q.department
  if (q.itemNumber) {
    const asNum = Number(q.itemNumber)
    if (Number.isFinite(asNum) && String(asNum) === q.itemNumber) {
      filter.itemNumber = asNum
    } else {
      filter.itemNumberString = q.itemNumber
    }
  }
  return filter
}

function clientMatches(item: InventoryItem, q: ReturnType<typeof normalizeQuery>): boolean {
  if (q.locationId && item.locationId !== q.locationId) return false
  if (q.department && item.department.toLowerCase() !== q.department.toLowerCase()) return false
  if (q.itemNumber && !item.itemNumber.toLowerCase().includes(q.itemNumber.toLowerCase())) {
    return false
  }
  if (q.name && !item.style.toLowerCase().includes(q.name.toLowerCase())) return false
  if (
    q.vendorItemName &&
    !item.vendorItemName.toLowerCase().includes(q.vendorItemName.toLowerCase())
  ) {
    return false
  }
  if (q.vendor && !item.vendor.toLowerCase().includes(q.vendor.toLowerCase())) return false
  if (q.size && item.size !== q.size) return false
  if (q.color && !item.color.toLowerCase().includes(q.color.toLowerCase())) return false
  return true
}

function hasAnyFilter(q: ReturnType<typeof normalizeQuery>): boolean {
  return Boolean(
    q.department ||
      q.name ||
      q.vendorItemName ||
      q.vendor ||
      q.size ||
      q.color ||
      q.itemNumber,
  )
}

async function listItemsForLocation(
  location: BridalLiveLocationCredentials,
  environmentStoreId: string,
  filter: BridalLiveItem,
): Promise<InventoryItem[]> {
  const items: InventoryItem[] = []
  let page = 1
  let total = Number.POSITIVE_INFINITY

  while (items.length < total && page <= MAX_PAGES) {
    const data = await bridalLiveFetch<BridalLiveItemListResult>('/api/items/list', {
      method: 'POST',
      storeId: environmentStoreId,
      query: {
        page,
        size: PAGE_SIZE,
        sortField: 'itemNumber',
        sortDirection: 'asc',
      },
      body: JSON.stringify(filter),
    })

    const batch = data?.result ?? []
    total = typeof data?.total === 'number' ? data.total : batch.length
    for (const raw of batch) {
      items.push(mapBridalLiveItem(raw, location))
    }
    if (batch.length < PAGE_SIZE) break
    page += 1
  }

  return items
}

async function locationsToSearch(
  locationId: string | undefined,
  storeId: string,
): Promise<BridalLiveLocationCredentials[]> {
  const shops = DEFAULT_BRIDALLIVE_LOCATIONS

  if (locationId) {
    const match = shops.find((l) => l.id === locationId)
    return match ? [match] : []
  }

  if (shops.length > 0) return [...shops]

  const fallback = shops.find((l) => l.id === storeId)
  return fallback ? [fallback] : []
}

async function search(
  query: InventorySearchQuery,
  storeId: string,
): Promise<InventorySearchResult> {
  const q = normalizeQuery(query)
  const locations = await locationsToSearch(q.locationId || undefined, storeId)
  if (locations.length === 0) {
    throw new Error(
      'Sign in on Home and pick your working location first.',
    )
  }

  const filter = buildListFilter(q)
  const collected: InventoryItem[] = []

  for (const location of locations) {
    const rows = await listItemsForLocation(location, location.id, filter)
    collected.push(...rows)
  }

  const items = collected
    .filter((item) => (hasAnyFilter(q) || q.locationId ? clientMatches(item, q) : true))
    .sort((a, b) => {
      if (a.locationId !== b.locationId) return a.locationId.localeCompare(b.locationId)
      return a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true })
    })

  let duplicateWarning: string | undefined
  if (q.name && q.size && q.color) {
    // Prefer exact style siblings; size/color matched exactly in findDuplicateWarning.
    const styleKey = q.name.toLowerCase()
    const siblings = items.filter((i) => i.style.toLowerCase() === styleKey)
    duplicateWarning = findDuplicateWarning(
      siblings.length > 0 ? siblings : items,
      q.name,
      q.size,
      q.color,
    )
  }

  return { items, duplicateWarning }
}

async function findSourceItem(
  sourceItemNumber: string | undefined,
  styleId: string,
  storeId: string,
  options?: {
    sourceInventoryItemId?: string
    sourceLocationId?: string
  },
): Promise<{ item: BridalLiveItem; location: BridalLiveLocationCredentials } | null> {
  const preferredLocationId = options?.sourceLocationId?.trim()
  const locations = preferredLocationId
    ? await locationsToSearch(preferredLocationId, storeId)
    : await locationsToSearch(undefined, storeId)

  const inventoryItemId = options?.sourceInventoryItemId?.trim()
  if (inventoryItemId && /^\d+$/.test(inventoryItemId)) {
    for (const location of locations) {
      try {
        const item = await bridalLiveFetch<BridalLiveItem>(`/api/items/${inventoryItemId}`, {
          method: 'GET',
          storeId: location.id,
        })
        if (item?.id != null) return { item, location }
      } catch {
        /* try next location / fall through to list */
      }
    }
  }

  for (const location of locations) {
    const filter: BridalLiveItem = {}
    if (sourceItemNumber) {
      const asNum = Number(sourceItemNumber)
      if (Number.isFinite(asNum) && String(asNum) === sourceItemNumber.trim()) {
        filter.itemNumber = asNum
      } else {
        filter.itemNumberString = sourceItemNumber.trim()
      }
    } else if (styleId) {
      filter.name = styleId
    } else {
      continue
    }

    const data = await bridalLiveFetch<BridalLiveItemListResult>('/api/items/list', {
      method: 'POST',
      storeId: location.id,
      query: { page: 1, size: 50, sortField: 'id', sortDirection: 'asc' },
      body: JSON.stringify(filter),
    })

    const match =
      (sourceItemNumber
        ? data?.result?.find((row) => formatItemNumber(row) === sourceItemNumber.trim())
        : data?.result?.[0]) ?? null
    if (!match?.id) continue

    // List rows can be sparse — load the full item before cloning.
    try {
      const full = await bridalLiveFetch<BridalLiveItem>(`/api/items/${match.id}`, {
        method: 'GET',
        storeId: location.id,
      })
      if (full?.id != null) return { item: full, location }
    } catch {
      return { item: match, location }
    }
  }
  return null
}

/** Load all variants of a style at a location for reliable duplicate checks. */
async function listStyleSiblings(
  styleId: string,
  storeId: string,
): Promise<InventoryItem[]> {
  const { items } = await search({ name: styleId, locationId: storeId }, storeId)
  const styleKey = styleId.trim().toLowerCase()
  return items.filter((i) => i.style.trim().toLowerCase() === styleKey)
}

async function createVariant(
  payload: InventoryCreateVariantPayload,
  storeId: string,
): Promise<InventoryCreateVariantResult> {
  const styleId = payload.styleId.trim()
  const size = payload.size.trim()
  const color = payload.color.trim()
  const vendorItemName = payload.vendorItemName.trim()
  if (!styleId || !size || !color) {
    return { ok: false, message: 'Style, size, and color are required.' }
  }
  if (!vendorItemName) {
    return {
      ok: false,
      message:
        'Vendor item name is required. Enter the manufacturer / vendor style name so BridalLive can find this item.',
    }
  }

  const source = await findSourceItem(payload.sourceItemNumber, styleId, storeId, {
    sourceInventoryItemId: payload.sourceInventoryItemId,
    sourceLocationId: payload.sourceLocationId,
  })
  if (!source) {
    return {
      ok: false,
      message: payload.sourceItemNumber
        ? `Could not find source item ${payload.sourceItemNumber} in BridalLive.`
        : `Could not find a source item for style ${styleId}. Use “+” on an existing inventory row first.`,
    }
  }

  const sourceSize = (source.item.size ?? source.item.sizeString ?? '').trim()
  const sourceColor = (source.item.color ?? source.item.colorString ?? '').trim()
  if (
    sourceSize.toLowerCase() === size.toLowerCase() &&
    sourceColor.toLowerCase() === color.toLowerCase()
  ) {
    const existingNumber = formatItemNumber(source.item) || payload.sourceItemNumber || 'unknown'
    return {
      ok: false,
      message: `This style + size + color already exists as item ${existingNumber} (${sourceSize} / ${sourceColor}). Enter a different size or color.`,
    }
  }

  const siblings = await listStyleSiblings(styleId, source.location.id)
  const dup = findDuplicateWarning(siblings, styleId, size, color)
  if (dup) {
    return { ok: false, message: dup }
  }

  const body = buildVariantCreateBody(source.item, size, color, {
    name: styleId,
    vendorItemName,
  })

  const created = await bridalLiveFetch<BridalLiveItem>('/api/items', {
    method: 'POST',
    storeId: source.location.id,
    body: JSON.stringify(body),
  })

  // Prefer a fresh GET so we confirm the item actually exists and is searchable.
  let persisted: BridalLiveItem | null = created ?? null
  if (created?.id != null) {
    try {
      persisted = await bridalLiveFetch<BridalLiveItem>(`/api/items/${created.id}`, {
        method: 'GET',
        storeId: source.location.id,
      })
    } catch {
      persisted = created
    }
  }

  if (!persisted || (persisted.id == null && !formatItemNumber(persisted))) {
    return {
      ok: false,
      message:
        'BridalLive did not return a created item. The variant may not have been saved — check inventory before retrying.',
    }
  }

  const mapped = mapBridalLiveItem(persisted, source.location)
  const itemNumber = mapped.itemNumber || formatItemNumber(persisted)
  if (!itemNumber) {
    return {
      ok: false,
      message:
        'BridalLive created a record but returned no item number. Check inventory before retrying or adding to a sale.',
    }
  }

  // Confirm list search can see it (same path staff use in the Helper).
  try {
    const verify = await search(
      { itemNumber, locationId: source.location.id },
      source.location.id,
    )
    const found = verify.items.some((i) => i.itemNumber === itemNumber)
    if (!found) {
      return {
        ok: true,
        itemNumber,
        saleSearchQuery: mapped.saleSearchQuery || itemNumber,
        message:
          `Added as ${itemNumber} at ${source.location.name}, but it is not in item search yet. ` +
          `In BridalLive Items, search item #${itemNumber} and confirm Vendor Item Name is “${vendorItemName}”.`,
      }
    }
  } catch {
    /* non-fatal — create already succeeded */
  }

  return {
    ok: true,
    itemNumber,
    saleSearchQuery: mapped.saleSearchQuery || itemNumber,
    message:
      `Added in BridalLive: ${itemNumber} at ${source.location.name}` +
      ` (vendor item name: ${vendorItemName}). Use ⊕ to add it to the open sale.`,
  }
}

/**
 * Live BridalLive inventory. The Helper server holds shop keys and proxies /api/items/*.
 */
export const bridalliveInventoryProvider: InventoryProvider = {
  search,
  createVariant,
}
