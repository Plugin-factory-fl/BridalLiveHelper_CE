import type { InventorySearchQuery } from '../types/inventory'
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
