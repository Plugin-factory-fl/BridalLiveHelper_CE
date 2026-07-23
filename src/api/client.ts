import { API_BASE_URL } from '../lib/config'
import { resolveDataSource } from '../lib/data-source'
import {
  isLocationConfigured,
  loadBridalLiveApiSettings,
} from '../lib/bridallive-credentials'
import { searchInventory, createVariant } from '../inventory/service'
import type {
  AuthSession,
  LabelPrintBatchRequest,
  LabelPrintBatchResult,
  Store,
} from './types'

export { searchInventory, createVariant }

const MOCK_STORES: Store[] = [
  { id: 'store-1', name: 'Main Boutique' },
  { id: 'store-2', name: 'Second Location' },
]

export async function listStores(): Promise<Store[]> {
  const source = await resolveDataSource()
  if (source === 'bridallive') {
    const settings = await loadBridalLiveApiSettings()
    const configured = settings.locations.filter(isLocationConfigured)
    if (configured.length > 0) {
      return configured.map((l) => ({ id: l.id, name: l.name }))
    }
  }
  if (source === 'mock') return MOCK_STORES
  if (!API_BASE_URL) return MOCK_STORES
  const res = await fetch(`${API_BASE_URL}/stores`)
  if (!res.ok) throw new Error('Failed to load stores')
  return res.json() as Promise<Store[]>
}

export async function getSession(): Promise<AuthSession | null> {
  if ((await resolveDataSource()) === 'mock') {
    return {
      userId: 'mock-user',
      role: 'admin',
      storeId: null,
      email: 'admin@example.com',
    }
  }
  if (!API_BASE_URL) return null
  const res = await fetch(`${API_BASE_URL}/auth/session`)
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Failed to load session')
  return res.json() as Promise<AuthSession>
}

export { printLabelBatch } from '../labels/service'
