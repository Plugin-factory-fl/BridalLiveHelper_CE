import type { InventoryItem } from '../types/inventory'
import type { LabelLineItem } from '../api/types'
import type { SpreadsheetInventoryRow } from './spreadsheet/types'
import { getWorkingLocationId } from '../lib/helper-session'
import { resolveDataSource } from '../lib/data-source'
import { getMockCatalog } from '../inventory/mock-provider'
import { searchInventory } from '../inventory/service'
import { bridalLiveFetch } from '../lib/bridallive-auth'
import { itemDescription, type BridalLiveItem } from '../lib/bridallive-item-map'

/**
 * Labels print BridalLive's own item Description field (`description`).
 * The items list endpoint can leave it out, so read the full item when it is missing.
 */
async function withBridalLiveDescription(
  item: InventoryItem,
  storeId: string,
): Promise<InventoryItem> {
  if ((item.description ?? '').trim() || !/^\d+$/.test(item.id)) return item
  if ((await resolveDataSource()) !== 'bridallive') return item
  try {
    const full = await bridalLiveFetch<BridalLiveItem>(`/api/items/${item.id}`, {
      method: 'GET',
      storeId: item.locationId || storeId,
    })
    const description = full ? itemDescription(full) : ''
    if (!description) console.info(`[labels] BridalLive item #${item.itemNumber} has no Description.`)
    return description ? { ...item, description } : item
  } catch (err) {
    console.warn(`[labels] Could not read Description for item #${item.itemNumber}:`, err)
    return item
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

/** Exact item # match from BridalLive (preferred reprint lookup). */
export async function lookupInventoryByItemNumber(
  itemNumber: string,
  storeId?: string,
): Promise<InventoryItem | null> {
  const want = itemNumber.trim()
  if (!want) return null

  const resolvedStoreId = storeId || (await getWorkingLocationId())
  const { items } = await searchInventory(
    { itemNumber: want, locationId: resolvedStoreId },
    resolvedStoreId,
  )
  const match =
    items.find((i) => normalizeKey(i.itemNumber) === normalizeKey(want)) ??
    (items.length === 1 ? items[0]! : null)
  return match ? withBridalLiveDescription(match, resolvedStoreId) : null
}

/**
 * Load catalog rows needed to enrich label fields (price, color, size, barcode).
 * Uses live BridalLive when staff are signed in on Home.
 */
export async function loadCatalogForLabelPrint(
  lines: LabelLineItem[],
): Promise<InventoryItem[]> {
  if ((await resolveDataSource()) !== 'bridallive') {
    return getMockCatalog()
  }

  const storeId = await getWorkingLocationId()
  const byId = new Map<string, InventoryItem>()

  for (const line of lines) {
    const itemNumber = line.itemNumber?.trim()
    if (!itemNumber) continue
    const match = await lookupInventoryByItemNumber(itemNumber, storeId)
    if (match) byId.set(match.id, match)
  }

  return [...byId.values()]
}

/** Search by item #, name, or vendor item name for the reprint picker. */
export async function searchInventoryForReprint(
  query: string,
  storeId?: string,
): Promise<InventoryItem[]> {
  const want = query.trim()
  if (!want) return []

  const resolvedStoreId = storeId || (await getWorkingLocationId())
  const byId = new Map<string, InventoryItem>()
  const add = (items: InventoryItem[]) => {
    for (const item of items) byId.set(item.id, item)
  }

  const looksLikeItemNumber = /^[\dA-Za-z][\dA-Za-z-]*$/.test(want) && want.length <= 16
  if (looksLikeItemNumber) {
    const { items } = await searchInventory(
      { itemNumber: want, locationId: resolvedStoreId },
      resolvedStoreId,
    )
    add(items)
  }

  const { items: byName } = await searchInventory(
    { name: want, locationId: resolvedStoreId },
    resolvedStoreId,
  )
  add(byName)

  if (byId.size === 0) {
    const { items: byVendorName } = await searchInventory(
      { vendorItemName: want, locationId: resolvedStoreId },
      resolvedStoreId,
    )
    add(byVendorName)
  }

  return [...byId.values()]
}

export function inventoryItemToLabelLine(
  item: InventoryItem,
  quantity: number,
): LabelLineItem {
  return {
    itemNumber: item.itemNumber,
    vendorItemName: item.vendorItemName,
    quantity,
    style: item.style,
    size: item.size,
    color: item.color,
    department: item.department as LabelLineItem['department'],
    retailPrice: item.retailPrice,
    salePrice: item.salePrice,
  }
}

/** Fill scan-gun rows with BridalLive item details at the working location. */
export async function matchScanRowsToBridalLive(
  rows: SpreadsheetInventoryRow[],
  storeId?: string,
): Promise<SpreadsheetInventoryRow[]> {
  const resolvedStoreId = storeId || (await getWorkingLocationId())
  const cache = new Map<string, InventoryItem | null>()
  const out: SpreadsheetInventoryRow[] = []

  for (const row of rows) {
    const key = row.itemNumber.trim()
    if (!cache.has(key)) {
      cache.set(key, key ? await lookupInventoryByItemNumber(key, resolvedStoreId) : null)
    }
    const match = cache.get(key) ?? null
    if (!match) {
      out.push({ ...row, matched: false, selected: false })
      continue
    }
    out.push({
      ...row,
      matched: true,
      itemNumber: match.itemNumber,
      itemName: match.vendorItemName || match.style || match.itemNumber,
      description: match.description ?? '',
      vendorItemName: match.vendorItemName,
      vendorCode: match.vendorCode ?? row.vendorCode,
      color: match.color,
      size: match.size,
      retailPrice: match.retailPrice ?? null,
      salePrice: match.salePrice ?? null,
      department: match.department,
      selected: true,
    })
  }

  return out
}
