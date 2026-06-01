import { API_BASE_URL } from '../lib/config'
import type { InventorySearchQuery } from '../types/inventory'
import type { InventoryProvider } from './provider'
import type {
  InventoryCreateVariantPayload,
  InventoryCreateVariantResult,
  InventorySearchResult,
} from './types'

export const renderInventoryProvider: InventoryProvider = {
  async search(query, storeId): Promise<InventorySearchResult> {
    const res = await fetch(`${API_BASE_URL}/stores/${storeId}/inventory/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })
    if (!res.ok) throw new Error('Inventory search failed')
    return res.json() as Promise<InventorySearchResult>
  },

  async createVariant(
    payload: InventoryCreateVariantPayload,
    storeId: string,
  ): Promise<InventoryCreateVariantResult> {
    const res = await fetch(`${API_BASE_URL}/stores/${storeId}/inventory/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      return { ok: false, message: body.message ?? 'Create variant failed' }
    }
    return res.json() as Promise<InventoryCreateVariantResult>
  },
}
