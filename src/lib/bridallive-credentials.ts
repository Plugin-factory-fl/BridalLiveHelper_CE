import { STORAGE_KEYS } from './config'

/** BridalLive QA vs production API hosts use separate Retailer ID / API key pairs. */
export type BridalLiveApiEnvironment = 'qa' | 'production'

export type BridalLiveLocationCredentials = {
  id: string
  name: string
  retailerId: string
  apiKey: string
}

export type BridalLiveApiSettings = {
  environment: BridalLiveApiEnvironment
  activeLocationId: string
  locations: BridalLiveLocationCredentials[]
}

export const DEFAULT_BRIDALLIVE_LOCATIONS: BridalLiveLocationCredentials[] = [
  { id: 'white-plains', name: 'White Plains', retailerId: '', apiKey: '' },
  { id: 'poughkeepsie', name: 'Poughkeepsie', retailerId: '', apiKey: '' },
]

export const DEFAULT_BRIDALLIVE_API_SETTINGS: BridalLiveApiSettings = {
  environment: 'production',
  activeLocationId: 'poughkeepsie',
  locations: DEFAULT_BRIDALLIVE_LOCATIONS.map((loc) => ({ ...loc })),
}

function normalizeLocation(
  raw: Partial<BridalLiveLocationCredentials> | undefined,
  fallback: BridalLiveLocationCredentials,
): BridalLiveLocationCredentials {
  return {
    id: String(raw?.id ?? fallback.id),
    name: String(raw?.name ?? fallback.name).trim() || fallback.name,
    retailerId: String(raw?.retailerId ?? '').trim(),
    apiKey: String(raw?.apiKey ?? '').trim(),
  }
}

function normalizeSettings(raw: unknown): BridalLiveApiSettings {
  const data = (raw ?? {}) as Partial<BridalLiveApiSettings>
  const env =
    data.environment === 'production' || data.environment === 'qa'
      ? data.environment
      : DEFAULT_BRIDALLIVE_API_SETTINGS.environment

  const byId = new Map(
    (Array.isArray(data.locations) ? data.locations : []).map((loc) => [
      String(loc?.id ?? ''),
      loc,
    ]),
  )

  const locations = DEFAULT_BRIDALLIVE_LOCATIONS.map((fallback) =>
    normalizeLocation(byId.get(fallback.id), fallback),
  )

  const activeLocationId = locations.some((l) => l.id === data.activeLocationId)
    ? String(data.activeLocationId)
    : DEFAULT_BRIDALLIVE_API_SETTINGS.activeLocationId

  return { environment: env, activeLocationId, locations }
}

export async function loadBridalLiveApiSettings(): Promise<BridalLiveApiSettings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.bridalLiveApiSettings)
  return normalizeSettings(data[STORAGE_KEYS.bridalLiveApiSettings])
}

export async function saveBridalLiveApiSettings(
  settings: BridalLiveApiSettings,
): Promise<BridalLiveApiSettings> {
  const next = normalizeSettings(settings)
  await chrome.storage.local.set({
    [STORAGE_KEYS.bridalLiveApiSettings]: next,
  })
  return next
}

export function isLocationConfigured(
  loc: BridalLiveLocationCredentials | undefined,
): boolean {
  return Boolean(loc?.retailerId && loc?.apiKey)
}

export function getActiveLocation(
  settings: BridalLiveApiSettings,
): BridalLiveLocationCredentials | undefined {
  return (
    settings.locations.find((l) => l.id === settings.activeLocationId) ??
    settings.locations[0]
  )
}

/** Live keys for the selected boutique, when the Helper server still sends them. */
export async function getActiveBridalLiveCredentials(): Promise<{
  environment: BridalLiveApiEnvironment
  location: BridalLiveLocationCredentials
} | null> {
  const settings = await loadBridalLiveApiSettings()
  const location = getActiveLocation(settings)
  if (!isLocationConfigured(location) || !location) return null
  return { environment: settings.environment, location }
}

export function credentialsStatusLabel(settings: BridalLiveApiSettings): string {
  const configured = settings.locations.filter(isLocationConfigured)
  const total = settings.locations.length
  if (configured.length === 0) return 'No stores connected yet'
  const names = configured.map((l) => l.name).join(' and ')
  if (configured.length === total) return `Connected: ${names}`
  return `Connected: ${names} (${configured.length} of ${total} locations)`
}
