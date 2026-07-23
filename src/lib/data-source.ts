import { API_BASE_URL } from './config'
import { getActiveBridalLiveCredentials } from './bridallive-credentials'

/** How the extension loads inventory/label data. */
export type DataSource = 'mock' | 'render' | 'bridallive'

/** Sync hint from build flags only (labels / badges before async resolve). */
export function getDataSource(): DataSource {
  if (import.meta.env.VITE_BRIDALLIVE_API === 'true') return 'bridallive'
  if (API_BASE_URL) return 'render'
  return 'mock'
}

/** Prefer live BridalLive when Settings has Retailer ID + API key. */
export async function resolveDataSource(): Promise<DataSource> {
  if (import.meta.env.VITE_BRIDALLIVE_API === 'true') return 'bridallive'
  if (await getActiveBridalLiveCredentials()) return 'bridallive'
  if (API_BASE_URL) return 'render'
  return 'mock'
}

export function getDataSourceLabel(source: DataSource = getDataSource()): string {
  switch (source) {
    case 'bridallive':
      return 'BridalLive API'
    case 'render':
      return 'Custom backend'
    default:
      return 'Mock data (MVP)'
  }
}

export async function resolveDataSourceLabel(): Promise<string> {
  return getDataSourceLabel(await resolveDataSource())
}
