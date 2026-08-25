const HOSTS = {
  production: 'https://app.bridallive.com/bl-server',
  qa: 'https://qa.bridallive.com/bl-server',
}

const TOKEN_SKEW_MS = 60_000

function parseExpires(expires, fallbackHours = 8) {
  if (expires) {
    const ms = Date.parse(expires)
    if (!Number.isNaN(ms)) return ms
  }
  return Date.now() + fallbackHours * 60 * 60 * 1000
}

export function allowedBridalLivePath(pathname) {
  const path = String(pathname ?? '')
  if (!path.startsWith('/api/')) return false
  if (path.includes('..') || path.includes('//')) return false
  return (
    path.startsWith('/api/items') ||
    path.startsWith('/api/receivingVouchers') ||
    path.startsWith('/api/receivingVoucherItems') ||
    path.startsWith('/api/posTransactions')
  )
}

export function createBridalLiveProxy({ locationSecrets, environment }) {
  /** @type {Map<string, { token: string, expiresAt: number }>} */
  const cache = new Map()
  const env = environment === 'qa' ? 'qa' : 'production'
  const base = HOSTS[env]

  function secretsFor(locationId) {
    return locationSecrets(locationId) ?? { retailerId: '', apiKey: '' }
  }

  function isReady(locationId) {
    const s = secretsFor(locationId)
    return Boolean(s.retailerId && s.apiKey)
  }

  async function apiLogin(locationId) {
    const secrets = secretsFor(locationId)
    if (!secrets.retailerId || !secrets.apiKey) {
      const err = new Error(
        'This boutique is not connected on the Helper server yet. Ask Alex to add its BridalLive keys.',
      )
      err.status = 503
      throw err
    }
    const res = await fetch(`${base}/api/auth/apiLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        retailerId: secrets.retailerId,
        apiKey: secrets.apiKey,
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      const err = new Error(
        `BridalLive could not sign this boutique in (${res.status}). ${text.slice(0, 180)}`,
      )
      err.status = res.status === 401 ? 502 : 502
      throw err
    }
    let data = {}
    try {
      data = JSON.parse(text)
    } catch {
      data = {}
    }
    if (!data.token) {
      const err = new Error('BridalLive did not return a session for this boutique.')
      err.status = 502
      throw err
    }
    const session = {
      token: data.token,
      expiresAt: parseExpires(data.expires),
    }
    cache.set(locationId, session)
    return session
  }

  async function sessionFor(locationId) {
    const cached = cache.get(locationId)
    if (cached?.token && cached.expiresAt - TOKEN_SKEW_MS > Date.now()) return cached
    return apiLogin(locationId)
  }

  async function forward({ locationId, method, path, search, body, contentType }) {
    if (!allowedBridalLivePath(path)) {
      const err = new Error('That BridalLive request is not allowed.')
      err.status = 403
      throw err
    }
    const run = async (token) => {
      const url = new URL(`${base}${path}`)
      if (search) {
        const incoming = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
        for (const [key, value] of incoming.entries()) {
          url.searchParams.set(key, value)
        }
      }
      const headers = {
        Accept: 'application/json',
        token,
      }
      const upper = String(method || 'GET').toUpperCase()
      if (body && upper !== 'GET' && upper !== 'HEAD') {
        headers['Content-Type'] = contentType || 'application/json'
      }
      return fetch(url.toString(), {
        method: upper,
        headers,
        body: upper === 'GET' || upper === 'HEAD' ? undefined : body,
      })
    }

    let session = await sessionFor(locationId)
    let res = await run(session.token)
    if (res.status === 401) {
      cache.delete(locationId)
      session = await apiLogin(locationId)
      res = await run(session.token)
    }
    const text = await res.text()
    return { status: res.status, text }
  }

  return { isReady, forward, environment: env }
}
