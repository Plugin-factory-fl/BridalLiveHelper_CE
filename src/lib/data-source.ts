import { API_BASE_URL } from './config'
import { loadHelperSession } from './helper-session'

/** How the extension loads inventory/label data. */
export type DataSource = 'mock' | 'render' | 'bridallive'

/** Sync hint from build flags only (labels / badges before async resolve). */
export function getDataSource(): DataSource {
  if (import.meta.env.VITE_BRIDALLIVE_API === 'true') return 'bridallive'
  if (API_BASE_URL) return 'render'
  return 'mock'
}

/** Live BridalLive (via the Helper server) when staff are signed in on Home. */
export async function resolveDataSource(): Promise<DataSource> {
  if (import.meta.env.VITE_BRIDALLIVE_API === 'true') return 'bridallive'
  const session = await loadHelperSession()
  if (session?.token && API_BASE_URL) return 'bridallive'
  return 'mock'
}

export function getDataSourceLabel(source: DataSource = getDataSource()): string {
  switch (source) {
    case 'bridallive':
      return 'Connected to BridalLive through the Helper server'
    case 'render':
      return 'Sign in on Home to use live inventory'
    default:
      return 'Sample catalog (not signed in)'
  }
}

export async function resolveDataSourceLabel(): Promise<string> {
  return getDataSourceLabel(await resolveDataSource())
}
