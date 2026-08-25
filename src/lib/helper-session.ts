import { API_BASE_URL, STORAGE_KEYS } from './config'
import { clearBridalLiveSessions } from './bridallive-auth'
import {
  DEFAULT_BRIDALLIVE_LOCATIONS,
  isLocationConfigured,
  loadBridalLiveApiSettings,
  saveBridalLiveApiSettings,
  type BridalLiveApiEnvironment,
} from './bridallive-credentials'
import { savePreferences } from './storage'

export type HelperUser = {
  email: string
  displayName: string
}

export type HelperLocation = {
  id: string
  name: string
}

export type HelperSignupConfig = {
  enabled: boolean
  codeRequired: boolean
}

export type HelperSession = {
  token: string
  user: HelperUser
  locationId: string
}

export type BridalLiveFromServer = {
  connected?: boolean
  retailerId?: string
  apiKey?: string
  environment?: BridalLiveApiEnvironment
}

function locationName(id: string): string {
  return HELPER_LOCATIONS.find((l) => l.id === id)?.name ?? id
}

function hasLiveKeys(bl: BridalLiveFromServer | null | undefined): bl is BridalLiveFromServer & {
  retailerId: string
  apiKey: string
} {
  return Boolean(bl?.retailerId?.trim() && bl?.apiKey?.trim())
}

function isBoutiqueReady(
  bl: BridalLiveFromServer | null | undefined,
  locationConfigured: boolean,
): boolean {
  if (bl?.connected === true) return true
  if (hasLiveKeys(bl)) return true
  return locationConfigured
}

export const HELPER_LOCATIONS: HelperLocation[] = DEFAULT_BRIDALLIVE_LOCATIONS.map(
  (l) => ({ id: l.id, name: l.name }),
)

export const HELPER_SESSION_CHANGED = 'blh-helper-session-changed'

function notifySessionChanged(): void {
  document.dispatchEvent(new CustomEvent(HELPER_SESSION_CHANGED))
}

let cachedSession: HelperSession | null | undefined
let cachedSignupConfig: HelperSignupConfig | undefined

function parseSession(raw: Partial<HelperSession> | undefined): HelperSession | null {
  if (!raw?.token || !raw.user?.email || !raw.locationId) return null
  return {
    token: String(raw.token),
    user: {
      email: String(raw.user.email),
      displayName: String(raw.user.displayName || raw.user.email),
    },
    locationId: String(raw.locationId),
  }
}

export function peekHelperSession(): HelperSession | null {
  return cachedSession ?? null
}

export function peekSignupConfig(): HelperSignupConfig | undefined {
  return cachedSignupConfig
}

export async function loadHelperSession(): Promise<HelperSession | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.helperSession)
  cachedSession = parseSession(data[STORAGE_KEYS.helperSession] as Partial<HelperSession> | undefined)
  return cachedSession
}

/** Confirm the Helper server still has this token. Does not sign you out if it restarted. */
export async function validateHelperSession(): Promise<HelperSession | null> {
  const session = await loadHelperSession()
  if (!session?.token || !API_BASE_URL) return session
  try {
    const res = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: { Authorization: `Bearer ${session.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401) {
      /* Keep the local session so Poughkeepsie inventory already on this computer
         keeps working. Switching boutique will ask them to sign in again. */
      return session
    }
    if (!res.ok) return session
    const data = (await res.json()) as {
      locationId?: string
      user?: HelperUser
      bridalLive?: BridalLiveFromServer | null
    }
    const locationId = data.locationId || session.locationId
    const user = data.user ?? session.user
    await applyWorkingLocation(locationId, data.bridalLive)
    if (locationId === session.locationId && user.email === session.user.email) {
      return session
    }
    const next: HelperSession = { ...session, locationId, user }
    await saveHelperSession(next)
    return next
  } catch {
    return session
  }
}

export async function saveHelperSession(session: HelperSession): Promise<void> {
  cachedSession = session
  await chrome.storage.local.set({ [STORAGE_KEYS.helperSession]: session })
  notifySessionChanged()
}

export async function clearHelperSession(): Promise<void> {
  cachedSession = null
  await chrome.storage.local.remove(STORAGE_KEYS.helperSession)
  notifySessionChanged()
}

export async function getWorkingLocationId(): Promise<string> {
  const session = await loadHelperSession()
  if (session?.locationId) return session.locationId
  const settings = await loadBridalLiveApiSettings()
  return settings.activeLocationId || HELPER_LOCATIONS[0]!.id
}

async function applyWorkingLocation(
  locationId: string,
  bridalLive?: BridalLiveFromServer | null,
): Promise<void> {
  const settings = await loadBridalLiveApiSettings()
  clearBridalLiveSessions()
  const locations = DEFAULT_BRIDALLIVE_LOCATIONS.map((fallback) => {
    const existing = settings.locations.find((l) => l.id === fallback.id) ?? fallback
    if (fallback.id !== locationId || !hasLiveKeys(bridalLive)) {
      return { ...existing, id: fallback.id, name: fallback.name }
    }
    return {
      id: fallback.id,
      name: fallback.name,
      retailerId: bridalLive.retailerId.trim(),
      apiKey: bridalLive.apiKey.trim(),
    }
  })
  await saveBridalLiveApiSettings({
    environment: bridalLive?.environment === 'qa' ? 'qa' : 'production',
    activeLocationId: locationId,
    locations,
  })
  await savePreferences({ mockStoreId: locationId })
}

export async function setWorkingLocation(locationId: string): Promise<HelperSession | null> {
  const known = HELPER_LOCATIONS.some((l) => l.id === locationId)
  if (!known) throw new Error('Unknown location.')

  const session = await loadHelperSession()
  let bridalLive: BridalLiveFromServer | null = null
  let helperSessionExpired = false

  if (session && API_BASE_URL && session.token) {
    const res = await fetch(`${API_BASE_URL}/auth/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ locationId }),
    })
    if (res.status === 401) {
      helperSessionExpired = true
    } else if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(body.message ?? 'Could not switch location.')
    } else {
      const data = (await res.json()) as { bridalLive?: BridalLiveFromServer | null }
      bridalLive = data.bridalLive ?? null
    }
  }

  await applyWorkingLocation(locationId, bridalLive)
  const settings = await loadBridalLiveApiSettings()
  const loc = settings.locations.find((l) => l.id === locationId)
  const ready = isBoutiqueReady(bridalLive, isLocationConfigured(loc))

  if (!ready && helperSessionExpired) {
    throw new Error(
      `Sign in again on Home, then pick ${locationName(locationId)}. ` +
        'The Helper server dropped this session. Poughkeepsie still worked because it was already connected on this computer.',
    )
  }
  if (!ready) {
    throw new Error(
      `${locationName(locationId)} is not connected on the Helper server yet. ` +
        'Ask Alex to add that boutique’s Live BridalLive API keys (not Practice).',
    )
  }

  if (!session) return null
  const next = { ...session, locationId }
  await saveHelperSession(next)
  return next
}

type LoginResponse = {
  token: string
  user: HelperUser
  locationId: string
  bridalLive?: BridalLiveFromServer | null
}

async function applyLoginResponse(data: LoginResponse, fallbackLocationId: string): Promise<HelperSession> {
  const session: HelperSession = {
    token: data.token,
    user: data.user,
    locationId: data.locationId || fallbackLocationId,
  }
  await applyWorkingLocation(session.locationId, data.bridalLive)
  await saveHelperSession(session)
  return session
}

function requireApi(): string {
  if (!API_BASE_URL) {
    throw new Error(
      'The Helper server is not connected yet. Ask Alex to turn it on — BridalLive keys stay on the server, not in this panel.',
    )
  }
  return API_BASE_URL
}

export async function loadSignupConfig(): Promise<HelperSignupConfig> {
  if (cachedSignupConfig) return cachedSignupConfig
  const base = API_BASE_URL
  if (!base) {
    cachedSignupConfig = { enabled: false, codeRequired: false }
    return cachedSignupConfig
  }
  try {
    const res = await fetch(`${base}/auth/signup-config`)
    if (!res.ok) {
      cachedSignupConfig = { enabled: true, codeRequired: false }
      return cachedSignupConfig
    }
    const data = (await res.json()) as Partial<HelperSignupConfig>
    cachedSignupConfig = {
      enabled: data.enabled !== false,
      codeRequired: Boolean(data.codeRequired),
    }
    return cachedSignupConfig
  } catch {
    cachedSignupConfig = { enabled: true, codeRequired: false }
    return cachedSignupConfig
  }
}

export async function helperLogin(
  email: string,
  password: string,
  locationId: string,
): Promise<HelperSession> {
  const trimmed = email.trim().toLowerCase()
  const shopId =
    HELPER_LOCATIONS.some((l) => l.id === locationId) ? locationId : HELPER_LOCATIONS[0]!.id
  if (!trimmed || !password) {
    throw new Error('Enter your email and password.')
  }
  const base = requireApi()

  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed, password, locationId: shopId }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Could not sign in. Check your email and password.')
  }
  const data = (await res.json()) as LoginResponse
  return applyLoginResponse(data, shopId)
}

export async function helperRegister(input: {
  email: string
  password: string
  displayName: string
  locationId: string
  signupCode?: string
}): Promise<HelperSession> {
  const trimmed = input.email.trim().toLowerCase()
  const name = input.displayName.trim()
  const shopId = HELPER_LOCATIONS.some((l) => l.id === input.locationId)
    ? input.locationId
    : HELPER_LOCATIONS[0]!.id
  if (!name) throw new Error('Enter your name.')
  if (!trimmed || !input.password) {
    throw new Error('Enter your email and a password.')
  }
  if (input.password.length < 8) {
    throw new Error('Use a password with at least 8 characters.')
  }
  const base = requireApi()

  const res = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: trimmed,
      password: input.password,
      displayName: name,
      locationId: shopId,
      signupCode: input.signupCode?.trim() || undefined,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Could not create the account.')
  }
  const data = (await res.json()) as LoginResponse
  return applyLoginResponse(data, shopId)
}

export async function helperLogout(): Promise<void> {
  const session = await loadHelperSession()
  if (session && API_BASE_URL) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    }).catch(() => {
      /* still clear local session */
    })
  }
  await clearHelperSession()
}
