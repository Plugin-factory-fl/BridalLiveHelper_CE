import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'
import type { InventorySearchQuery } from '../types/inventory'
import { getDataSource } from '../lib/data-source'
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

export function getInventoryProvider(): InventoryProvider {
  switch (getDataSource()) {
    case 'bridallive':
      return bridalliveInventoryProvider
    case 'render':
      return renderInventoryProvider
    default:
      return mockInventoryProvider
  }
}
