import { API_BASE_URL } from './config'
import { loadHelperSession } from './helper-session'
import {
  DEFAULT_BRIDALLIVE_LOCATIONS,
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

function helperBlUrl(path: string, query?: Record<string, string | number | boolean | undefined>): URL {
  const url = new URL(`${API_BASE_URL}/bl${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

function formatBridalLiveError(status: number, body: string, locationName: string): string {
  const text = body.trim()
  let detail = text.slice(0, 220)
  try {
    const parsed = JSON.parse(text) as {
      message?: string
      errors?: { message?: string; code?: string }[]
    }
    const fromList = parsed?.errors?.[0]?.message
    if (fromList) detail = fromList
    else if (parsed?.message) detail = parsed.message
  } catch {
    /* keep slice */
  }
  const lower = detail.toLowerCase()
  if (lower.includes('not logged in') || lower.includes('not signed in')) {
    return (
      `${locationName} could not sign in to BridalLive. Use Live store data (app.bridallive.com), not Practice. ` +
      `Then sign in again on Home and pick ${locationName}.`
    )
  }
  return `BridalLive could not sign ${locationName} in (${status}). ${detail}`
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
    return null
  }
  return getActiveBridalLiveCredentials()
}

async function apiLogin(
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
  const body = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(formatBridalLiveError(res.status, body, location.name))
  }
  const data = (body ? JSON.parse(body) : {}) as ApiLoginResponse
  if (!data.token) {
    throw new Error(`BridalLive did not return a session for ${location.name}.`)
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

async function proxyFetch<T>(
  path: string,
  init: RequestInit & { storeId?: string; query?: Record<string, string | number | boolean | undefined> },
): Promise<T> {
  const { storeId, query, headers: initHeaders, ...rest } = init
  if (!API_BASE_URL) {
    throw new Error('The Helper server is not connected yet. Ask Alex to turn it on.')
  }
  const helper = await loadHelperSession()
  if (!helper?.token) {
    throw new Error('Sign in on Home and pick your working location first.')
  }

  const url = helperBlUrl(path, query)
  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${helper.token}`)
  const locationId = storeId || helper.locationId
  if (locationId) headers.set('X-Helper-Location', locationId)
  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url.toString(), { ...rest, headers })
  const text = await res.text()

  if (res.status === 404) {
    throw new Error(
      'This Helper server does not proxy BridalLive yet. Sign in again on Home after the latest server is deployed, or use a location that is already connected.',
    )
  }

  if (!res.ok) {
    throw new Error(formatBridalLiveError(res.status, text, 'this boutique'))
  }
  if (res.status === 204 || !text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * Prefer shop keys already on this computer (Live BridalLive). If this
 * boutique has no local keys, go through the Helper server `/bl` proxy.
 */
export async function bridalLiveFetch<T>(
  path: string,
  init: RequestInit & { storeId?: string; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { storeId, query, headers: initHeaders, ...rest } = init
  const resolved = await resolveLocationCredentials(storeId)
  if (!resolved) {
    return proxyFetch<T>(path, init)
  }

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

  const text = await res.text()
  if (!res.ok) {
    throw new Error(formatBridalLiveError(res.status, text, resolved.location.name))
  }
  if (res.status === 204 || !text) return undefined as T
  return JSON.parse(text) as T
}

export async function getBridalLiveSession(storeId?: string): Promise<BridalLiveAuthSession> {
  const resolved = await resolveLocationCredentials(storeId)
  if (!resolved) {
    const helper = await loadHelperSession()
    if (!helper?.token) {
      throw new Error('Sign in on Home and pick your working location first.')
    }
    const location =
      DEFAULT_BRIDALLIVE_LOCATIONS.find((l) => l.id === (storeId || helper.locationId)) ??
      DEFAULT_BRIDALLIVE_LOCATIONS[0]!
    return {
      token: 'proxy',
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      environment: 'production',
      locationId: location.id,
      retailerId: '',
    }
  }

  const key = sessionKey(resolved.environment, resolved.location.retailerId)
  const cached = sessions.get(key)
  if (isSessionValid(cached)) return cached
  return apiLogin(resolved.environment, resolved.location)
}

export async function testBridalLiveConnection(storeId?: string): Promise<string> {
  const session = await getBridalLiveSession(storeId)
  const location =
    DEFAULT_BRIDALLIVE_LOCATIONS.find((l) => l.id === session.locationId)?.name ?? session.locationId
  if (session.token === 'proxy') {
    return `Connected to ${location} through the Helper server.`
  }
  return `Connected to ${location} (live BridalLive).`
}

export function clearBridalLiveSessions(): void {
  sessions.clear()
}
