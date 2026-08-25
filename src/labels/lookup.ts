import type { InventoryItem } from '../types/inventory'
import type { LabelLineItem } from '../api/types'
import { getWorkingLocationId } from '../lib/helper-session'
import { resolveDataSource } from '../lib/data-source'
import { getMockCatalog } from '../inventory/mock-provider'
import { searchInventory } from '../inventory/service'

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
  return (
    items.find((i) => normalizeKey(i.itemNumber) === normalizeKey(want)) ??
    (items.length === 1 ? items[0]! : null)
  )
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
