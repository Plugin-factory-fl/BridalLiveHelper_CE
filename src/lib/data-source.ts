import { API_BASE_URL } from './config'

/** How the extension loads inventory/label data. MVP defaults to mock. */
export type DataSource = 'mock' | 'render' | 'bridallive'

export function getDataSource(): DataSource {
  if (import.meta.env.VITE_BRIDALLIVE_API === 'true') return 'bridallive'
  if (API_BASE_URL) return 'render'
  return 'mock'
}

export function getDataSourceLabel(): string {
  switch (getDataSource()) {
    case 'bridallive':
      return 'BridalLive API (Phase 2)'
    case 'render':
      return 'Custom backend'
    default:
      return 'Mock data (MVP)'
  }
}
