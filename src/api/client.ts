import { API_BASE_URL } from '../lib/config'
import { getDataSource } from '../lib/data-source'
import { searchInventory, createVariant } from '../inventory/service'
import type {
  AuthSession,
  LabelPrintBatchRequest,
  LabelPrintBatchResult,
  Store,
} from './types'

export { searchInventory, createVariant }

/** True when labels/auth use mock paths (MVP default). */
export function useMockApi(): boolean {
  return getDataSource() === 'mock'
}

const MOCK_STORES: Store[] = [
  { id: 'store-1', name: 'Main Boutique' },
  { id: 'store-2', name: 'Second Location' },
]

export async function listStores(): Promise<Store[]> {
  if (useMockApi()) return MOCK_STORES
  const res = await fetch(`${API_BASE_URL}/stores`)
  if (!res.ok) throw new Error('Failed to load stores')
  return res.json() as Promise<Store[]>
}

export async function getSession(): Promise<AuthSession | null> {
  if (useMockApi()) {
    return {
      userId: 'mock-user',
      role: 'admin',
      storeId: null,
      email: 'admin@example.com',
    }
  }
  const res = await fetch(`${API_BASE_URL}/auth/session`)
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Failed to load session')
  return res.json() as Promise<AuthSession>
}

export { printLabelBatch } from '../labels/service'
