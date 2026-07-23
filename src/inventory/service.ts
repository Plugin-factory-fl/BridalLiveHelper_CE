import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import { getMockCatalog, findDuplicateWarning } from './mock-provider'
import { resolveDataSource } from '../lib/data-source'
import { getInventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

export async function searchInventory(
  query: InventorySearchQuery,
  storeId: string,
): Promise<InventorySearchResult> {
  return getInventoryProvider().search(query, storeId)
}

/** Catalog browse — full mock list in MVP; live API list (paged) in Phase 2. */
export async function listCatalogItems(_storeId: string): Promise<InventoryItem[]> {
  if ((await resolveDataSource()) === 'mock') {
    return [...getMockCatalog()].sort((a, b) =>
      a.saleSearchQuery.localeCompare(b.saleSearchQuery, undefined, { sensitivity: 'base' }),
    )
  }
  const { items } = await searchInventory({ locationId: _storeId }, _storeId)
  return items
}

export async function createVariant(
  payload: InventoryCreateVariantPayload,
  storeId: string,
): Promise<InventoryCreateVariantResult> {
  return getInventoryProvider().createVariant(payload, storeId)
}

/** Check style+size+color against catalog (mock or live search). */
export async function checkDuplicateVariant(
  styleId: string,
  size: string,
  color: string,
  storeId: string,
): Promise<string | undefined> {
  if ((await resolveDataSource()) === 'mock') {
    return findDuplicateWarning(getMockCatalog(), styleId, size, color)
  }
  // Search by style name only — BridalLive size/color filters are unreliable for
  // duplicate detection. Exact size+color match is done client-side.
  const { items } = await searchInventory({ name: styleId, locationId: storeId }, storeId)
  const styleKey = styleId.trim().toLowerCase()
  const siblings = items.filter((i) => i.style.trim().toLowerCase() === styleKey)
  return findDuplicateWarning(siblings.length > 0 ? siblings : items, styleId, size, color)
}
