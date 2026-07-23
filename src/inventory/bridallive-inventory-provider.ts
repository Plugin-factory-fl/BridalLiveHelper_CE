import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import {
  bridalLiveFetch,
  resolveLocationCredentials,
} from '../lib/bridallive-auth'
import {
  isLocationConfigured,
  loadBridalLiveApiSettings,
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
  const settings = await loadBridalLiveApiSettings()
  const configured = settings.locations.filter(isLocationConfigured)

  if (locationId) {
    const match = configured.find((l) => l.id === locationId)
    return match ? [match] : []
  }

  // No location filter → all configured locations (e.g. “All locations” in the panel).
  if (configured.length > 0) return configured

  const fallback = configured.find((l) => l.id === storeId)
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
      'No BridalLive API credentials configured. Add Retailer ID and API key in Settings.',
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
    duplicateWarning = findDuplicateWarning(collected, q.name, q.size, q.color)
  }

  return { items, duplicateWarning }
}

async function findSourceItem(
  sourceItemNumber: string | undefined,
  styleId: string,
  storeId: string,
): Promise<{ item: BridalLiveItem; location: BridalLiveLocationCredentials } | null> {
  const locations = await locationsToSearch(undefined, storeId)
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
    if (match) return { item: match, location }
  }
  return null
}

async function createVariant(
  payload: InventoryCreateVariantPayload,
  storeId: string,
): Promise<InventoryCreateVariantResult> {
  const styleId = payload.styleId.trim()
  const size = payload.size.trim()
  const color = payload.color.trim()
  if (!styleId || !size || !color) {
    return { ok: false, message: 'Style, size, and color are required.' }
  }

  const dupSearch = await search(
    { name: styleId, size, color, locationId: storeId },
    storeId,
  )
  if (dupSearch.duplicateWarning) {
    return { ok: false, message: dupSearch.duplicateWarning }
  }

  const source = await findSourceItem(payload.sourceItemNumber, styleId, storeId)
  if (!source) {
    return {
      ok: false,
      message: payload.sourceItemNumber
        ? `Could not find source item ${payload.sourceItemNumber} in BridalLive.`
        : `Could not find a source item for style ${styleId}. Use “Use as source” on an existing row first.`,
    }
  }

  const creds = await resolveLocationCredentials(source.location.id)
  if (!creds) {
    return { ok: false, message: `No API credentials for ${source.location.name}.` }
  }

  const body = buildVariantCreateBody(source.item, size, color)
  body.name = styleId

  const created = await bridalLiveFetch<BridalLiveItem>('/api/items', {
    method: 'POST',
    storeId: source.location.id,
    body: JSON.stringify(body),
  })

  const mapped = mapBridalLiveItem(created ?? body, source.location)
  const itemNumber = mapped.itemNumber || formatItemNumber(created ?? {})

  return {
    ok: true,
    itemNumber: itemNumber || undefined,
    saleSearchQuery: mapped.saleSearchQuery || itemNumber || undefined,
    message: itemNumber
      ? `Variant created in BridalLive: ${itemNumber}`
      : 'Variant created in BridalLive.',
  }
}

/**
 * Live BridalLive inventory provider (Phase 2).
 * Uses Retailer ID + API key from Settings → apiLogin → /api/items/*.
 */
export const bridalliveInventoryProvider: InventoryProvider = {
  search,
  createVariant,
}
