import { API_BASE_URL, STORAGE_KEYS } from './config'
import { clearBridalLiveSessions } from './bridallive-auth'
import {
  DEFAULT_BRIDALLIVE_LOCATIONS,
  loadBridalLiveApiSettings,
  saveBridalLiveApiSettings,
} from './bridallive-credentials'

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

async function applyWorkingLocation(locationId: string): Promise<void> {
  const settings = await loadBridalLiveApiSettings()
  if (settings.activeLocationId === locationId) return
  clearBridalLiveSessions()
  await saveBridalLiveApiSettings({ ...settings, activeLocationId: locationId })
}

export async function setWorkingLocation(locationId: string): Promise<HelperSession | null> {
  const known = HELPER_LOCATIONS.some((l) => l.id === locationId)
  if (!known) throw new Error('Unknown location.')

  const session = await loadHelperSession()
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
  }

  await applyWorkingLocation(locationId)
  if (!session) return null
  const next = { ...session, locationId }
  await saveHelperSession(next)
  return next
}

type LoginResponse = {
  token: string
  user: HelperUser
  locationId: string
}

export async function helperLogin(
  email: string,
  password: string,
): Promise<HelperSession> {
  const trimmed = email.trim().toLowerCase()
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
    body: JSON.stringify({ email: trimmed, password }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message ?? 'Could not sign in. Check your email and password.')
  }
  const data = (await res.json()) as LoginResponse
  const session: HelperSession = {
    token: data.token,
    user: data.user,
    locationId: data.locationId || HELPER_LOCATIONS[0]!.id,
  }
  await applyWorkingLocation(session.locationId)
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
