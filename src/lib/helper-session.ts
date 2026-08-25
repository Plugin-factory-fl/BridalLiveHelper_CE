import { API_BASE_URL, STORAGE_KEYS } from './config'
import { clearBridalLiveSessions } from './bridallive-auth'
import {
  DEFAULT_BRIDALLIVE_LOCATIONS,
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

export type HelperSession = {
  token: string
  user: HelperUser
  locationId: string
}

export type BridalLiveFromServer = {
  retailerId: string
  apiKey: string
  environment?: BridalLiveApiEnvironment
}

export const HELPER_LOCATIONS: HelperLocation[] = DEFAULT_BRIDALLIVE_LOCATIONS.map(
  (l) => ({ id: l.id, name: l.name }),
)

export const HELPER_SESSION_CHANGED = 'blh-helper-session-changed'

function notifySessionChanged(): void {
  document.dispatchEvent(new CustomEvent(HELPER_SESSION_CHANGED))
}

export async function loadHelperSession(): Promise<HelperSession | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.helperSession)
  const raw = data[STORAGE_KEYS.helperSession] as Partial<HelperSession> | undefined
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

export async function saveHelperSession(session: HelperSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.helperSession]: session })
  notifySessionChanged()
}

export async function clearHelperSession(): Promise<void> {
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
    if (fallback.id !== locationId || !bridalLive?.retailerId || !bridalLive.apiKey) {
      return { ...existing, id: fallback.id, name: fallback.name }
    }
    return {
      id: fallback.id,
      name: fallback.name,
      retailerId: bridalLive.retailerId,
      apiKey: bridalLive.apiKey,
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
  if (session && API_BASE_URL && session.token) {
    const res = await fetch(`${API_BASE_URL}/auth/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ locationId }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(body.message ?? 'Could not switch location.')
    }
    const data = (await res.json()) as { bridalLive?: BridalLiveFromServer | null }
    bridalLive = data.bridalLive ?? null
  }

  await applyWorkingLocation(locationId, bridalLive)
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
  if (!API_BASE_URL) {
    throw new Error(
      'The Helper server is not connected yet. Ask Alex to turn it on — BridalLive keys stay on the server, not in this panel.',
    )
  }

  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed, password, locationId: shopId }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Could not sign in. Check your email and password.')
  }
  const data = (await res.json()) as LoginResponse
  const session: HelperSession = {
    token: data.token,
    user: data.user,
    locationId: data.locationId || shopId,
  }
  await applyWorkingLocation(session.locationId, data.bridalLive)
  await saveHelperSession(session)
  return session
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
