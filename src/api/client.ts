import { API_BASE_URL } from '../lib/config'
import { resolveDataSource } from '../lib/data-source'
import { HELPER_LOCATIONS, loadHelperSession } from '../lib/helper-session'
import { searchInventory, createVariant } from '../inventory/service'
import type { AuthSession, Store } from './types'

export { searchInventory, createVariant }

const MOCK_STORES: Store[] = [
  { id: 'store-1', name: 'Main Boutique' },
  { id: 'store-2', name: 'Second Location' },
]

export async function listStores(): Promise<Store[]> {
  const source = await resolveDataSource()
  if (source === 'bridallive') {
    return HELPER_LOCATIONS.map((l) => ({ id: l.id, name: l.name }))
  }
  if (source === 'mock') return MOCK_STORES
  if (!API_BASE_URL) return MOCK_STORES
  const res = await fetch(`${API_BASE_URL}/locations`)
  if (!res.ok) throw new Error('Failed to load stores')
  const data = (await res.json()) as { locations?: Store[] }
  return data.locations ?? MOCK_STORES
}

export async function getSession(): Promise<AuthSession | null> {
  const helper = await loadHelperSession()
  if (helper) {
    return {
      userId: helper.user.email,
      role: 'store',
      storeId: helper.locationId,
      email: helper.user.email,
    }
  }
  if ((await resolveDataSource()) === 'mock') {
    return {
      userId: 'mock-user',
      role: 'admin',
      storeId: null,
      email: 'admin@example.com',
    }
  }
  return null
}

export { printLabelBatch } from '../labels/service'
