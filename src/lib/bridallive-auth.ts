import {
  getActiveBridalLiveCredentials,
  isLocationConfigured,
  loadBridalLiveApiSettings,
  type BridalLiveApiEnvironment,
  type BridalLiveLocationCredentials,
} from './bridallive-credentials'

export type BridalLiveAuthSession = {
  token: string
  expiresAt: number
  environment: BridalLiveApiEnvironment
  locationId: string
  retailerId: string
  employeeId?: number
}

type ApiLoginResponse = {
  token?: string
  expires?: string
  employee?: { id?: number }
}

const TOKEN_SKEW_MS = 60_000
const sessions = new Map<string, BridalLiveAuthSession>()

export function bridalLiveBaseUrl(environment: BridalLiveApiEnvironment): string {
  return environment === 'production'
    ? 'https://app.bridallive.com/bl-server'
    : 'https://qa.bridallive.com/bl-server'
}

function sessionKey(environment: BridalLiveApiEnvironment, retailerId: string): string {
  return `${environment}:${retailerId}`
}

function parseExpires(expires: string | undefined, fallbackHours = 8): number {
  if (expires) {
    const ms = Date.parse(expires)
    if (!Number.isNaN(ms)) return ms
  }
  return Date.now() + fallbackHours * 60 * 60 * 1000
}

function isSessionValid(session: BridalLiveAuthSession | undefined): session is BridalLiveAuthSession {
  return Boolean(session?.token && session.expiresAt - TOKEN_SKEW_MS > Date.now())
}

export async function resolveLocationCredentials(
  storeId?: string,
): Promise<{
  environment: BridalLiveApiEnvironment
  location: BridalLiveLocationCredentials
} | null> {
  const settings = await loadBridalLiveApiSettings()
  if (storeId) {
    const match = settings.locations.find((l) => l.id === storeId)
    if (isLocationConfigured(match) && match) {
      return { environment: settings.environment, location: match }
    }
  }
  return getActiveBridalLiveCredentials()
}

export async function apiLogin(
  environment: BridalLiveApiEnvironment,
  location: BridalLiveLocationCredentials,
): Promise<BridalLiveAuthSession> {
  const url = `${bridalLiveBaseUrl(environment)}/api/auth/apiLogin`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      retailerId: location.retailerId,
      apiKey: location.apiKey,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `BridalLive apiLogin failed (${res.status}) for ${location.name}. ${body.slice(0, 200)}`,
    )
  }

  const data = (await res.json()) as ApiLoginResponse
  if (!data.token) {
    throw new Error(`BridalLive apiLogin returned no token for ${location.name}.`)
  }

  const session: BridalLiveAuthSession = {
    token: data.token,
    expiresAt: parseExpires(data.expires),
    environment,
    locationId: location.id,
    retailerId: location.retailerId,
    employeeId: data.employee?.id,
  }
  sessions.set(sessionKey(environment, location.retailerId), session)
  return session
}

export async function getBridalLiveSession(
  storeId?: string,
): Promise<BridalLiveAuthSession> {
  const resolved = await resolveLocationCredentials(storeId)
  if (!resolved) {
    throw new Error(
      'No BridalLive API credentials configured. Add Retailer ID and API key in Settings.',
    )
  }

  const key = sessionKey(resolved.environment, resolved.location.retailerId)
  const cached = sessions.get(key)
  if (isSessionValid(cached)) return cached

  return apiLogin(resolved.environment, resolved.location)
}

export async function testBridalLiveConnection(storeId?: string): Promise<string> {
  const session = await getBridalLiveSession(storeId)
  const envLabel = session.environment === 'production' ? 'Production' : 'QA'
  return `Connected to ${envLabel} (${session.locationId}). Token OK.`
}

export async function bridalLiveFetch<T>(
  path: string,
  init: RequestInit & { storeId?: string; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { storeId, query, headers: initHeaders, ...rest } = init
  const session = await getBridalLiveSession(storeId)

  const url = new URL(`${bridalLiveBaseUrl(session.environment)}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json')
  headers.set('token', session.token)
  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res = await fetch(url.toString(), { ...rest, headers })

  if (res.status === 401) {
    sessions.delete(sessionKey(session.environment, session.retailerId))
    const refreshed = await getBridalLiveSession(storeId)
    headers.set('token', refreshed.token)
    res = await fetch(url.toString(), { ...rest, headers })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`BridalLive ${path} failed (${res.status}): ${body.slice(0, 300)}`)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function clearBridalLiveSessions(): void {
  sessions.clear()
}
