import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'
import type { InventorySearchQuery } from '../types/inventory'
import { resolveDataSource } from '../lib/data-source'
import { bridalliveInventoryProvider } from './bridallive-inventory-provider'
import { mockInventoryProvider } from './mock-provider'
import { renderInventoryProvider } from './render-provider'

export interface InventoryProvider {
  search(query: InventorySearchQuery, storeId: string): Promise<InventorySearchResult>
  createVariant(
    payload: InventoryCreateVariantPayload,
    storeId: string,
  ): Promise<InventoryCreateVariantResult>
}

function providerFor(source: Awaited<ReturnType<typeof resolveDataSource>>): InventoryProvider {
  switch (source) {
    case 'bridallive':
      return bridalliveInventoryProvider
    case 'render':
      return renderInventoryProvider
    default:
      return mockInventoryProvider
  }
}

/**
 * Runtime-selected provider. Uses BridalLive when credentials are saved in Settings
 * (or when `VITE_BRIDALLIVE_API=true` at build time).
 */
export const inventoryProvider: InventoryProvider = {
  async search(query, storeId) {
    return providerFor(await resolveDataSource()).search(query, storeId)
  },
  async createVariant(payload, storeId) {
    return providerFor(await resolveDataSource()).createVariant(payload, storeId)
  },
}

export function getInventoryProvider(): InventoryProvider {
  return inventoryProvider
}
