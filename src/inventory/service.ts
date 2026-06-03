import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import { getMockCatalog, findDuplicateWarning } from './mock-provider'
import { getDataSource } from '../lib/data-source'
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

/** Full mock catalog A–Z by item name (style); used for browse UI in the panel. */
export async function listCatalogItems(_storeId: string): Promise<InventoryItem[]> {
  if (getDataSource() === 'mock') {
    return [...getMockCatalog()].sort((a, b) =>
      a.saleSearchQuery.localeCompare(b.saleSearchQuery, undefined, { sensitivity: 'base' }),
    )
  }
  const { items } = await searchInventory({}, _storeId)
  return items
}

export async function createVariant(
  payload: InventoryCreateVariantPayload,
  storeId: string,
): Promise<InventoryCreateVariantResult> {
  return getInventoryProvider().createVariant(payload, storeId)
}

/** Check style+size+color against catalog (mock or post-search). */
export async function checkDuplicateVariant(
  styleId: string,
  size: string,
  color: string,
  storeId: string,
): Promise<string | undefined> {
  if (getDataSource() === 'mock') {
    return findDuplicateWarning(getMockCatalog(), styleId, size, color)
  }
  const { duplicateWarning } = await searchInventory({ style: styleId, size, color }, storeId)
  return duplicateWarning
}
