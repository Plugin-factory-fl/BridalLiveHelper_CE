import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserStore } from './users.mjs'
import { createSessionStore } from './sessions.mjs'
import { allowedBridalLivePath, createBridalLiveProxy } from './bridallive.mjs'

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
for (const name of ['.env', '.env.example']) {
  const file = path.join(rootDir, name)
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
  if (name === '.env') break
}

const PORT = Number(process.env.PORT) || 8787
const DATA_DIR = process.env.HELPER_DATA_DIR || path.join(rootDir, 'data')
const userStore = createUserStore({
  dataDir: DATA_DIR,
  envUsersRaw: process.env.HELPER_USERS ?? '',
  signupCode: process.env.HELPER_SIGNUP_CODE ?? '',
  signupEnabled: process.env.HELPER_SIGNUP_DISABLED !== '1',
})
const sessionStore = createSessionStore(DATA_DIR)

const LOCATIONS = [
  { id: 'white-plains', name: 'White Plains' },
  { id: 'poughkeepsie', name: 'Poughkeepsie' },
]

const LOCATION_SECRETS = {
  'white-plains': {
    retailerId: process.env.BL_WP_RETAILER_ID ?? '',
    apiKey: process.env.BL_WP_API_KEY ?? '',
  },
  poughkeepsie: {
    retailerId: process.env.BL_PK_RETAILER_ID ?? '',
    apiKey: process.env.BL_PK_API_KEY ?? '',
  },
}

function locationSecrets(locationId) {
  return LOCATION_SECRETS[locationId] ?? { retailerId: '', apiKey: '' }
}

const bridalLive = createBridalLiveProxy({
  locationSecrets,
  environment: process.env.BL_ENVIRONMENT === 'qa' ? 'qa' : 'production',
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Helper-Location',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...CORS,
  })
  res.end(json)
}

function sendRaw(res, status, text) {
  const payload = text ?? ''
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS,
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({ json: {}, raw: '' })
        return
      }
      try {
        resolve({ json: JSON.parse(raw), raw })
      } catch {
        resolve({ json: {}, raw })
      }
    })
    req.on('error', reject)
  })
}

function bearer(req) {
  const header = String(req.headers.authorization ?? '')
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? ''
}

function requireSession(req, res) {
  const token = bearer(req)
  const record = sessionStore.get(token)
  if (!record) {
    send(res, 401, { message: 'Sign in on Home first.' })
    return null
  }
  return { token, record }
}

function resolveLocationId(requested) {
  return LOCATIONS.some((l) => l.id === requested) ? requested : 'poughkeepsie'
}

function publicSession(token, record) {
  const user = userStore.get(record.email)
  const connected = bridalLive.isReady(record.locationId)
  return {
    token,
    user: {
      email: record.email,
      displayName: user?.displayName ?? record.email,
    },
    locationId: record.locationId,
    locations: LOCATIONS,
    bridalLive: {
      connected,
      environment: bridalLive.environment,
    },
  }
}

function startSession(email, locationId) {
  const resolved = resolveLocationId(String(locationId ?? ''))
  const token = sessionStore.create(email, resolved)
  return publicSession(token, { email, locationId: resolved })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && (url.pathname === '/privacy' || url.pathname === '/privacy-policy')) {
      const file = path.join(rootDir, 'server/privacy.html')
      const html = fs.readFileSync(file, 'utf8')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        ...CORS,
      })
      res.end(html)
      return
    }

    if (req.method === 'GET' && url.pathname === '/auth/signup-config') {
      send(res, 200, userStore.signupConfig())
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const { json: body } = await readBody(req)
      const email = String(body.email ?? '')
        .trim()
        .toLowerCase()
      const password = String(body.password ?? '')
      const user = userStore.authenticate(email, password)
      if (!user) {
        send(res, 401, { message: 'Could not sign in. Check your email and password.' })
        return
      }
      send(res, 200, startSession(user.email, body.locationId))
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/register') {
      const { json: body } = await readBody(req)
      const result = userStore.register({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        signupCode: body.signupCode,
      })
      if (!result.ok) {
        send(res, result.status, { message: result.message })
        return
      }
      send(res, 201, startSession(result.user.email, body.locationId))
      return
    }

    if (req.method === 'GET' && url.pathname === '/auth/session') {
      const authed = requireSession(req, res)
      if (!authed) return
      send(res, 200, publicSession(authed.token, authed.record))
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      sessionStore.delete(bearer(req))
      send(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/location') {
      const authed = requireSession(req, res)
      if (!authed) return
      const { json: body } = await readBody(req)
      const locationId = String(body.locationId ?? '')
      if (!LOCATIONS.some((l) => l.id === locationId)) {
        send(res, 400, { message: 'Unknown location.' })
        return
      }
      sessionStore.setLocation(authed.token, locationId)
      authed.record.locationId = locationId
      send(res, 200, publicSession(authed.token, authed.record))
      return
    }

    if (req.method === 'GET' && url.pathname === '/locations') {
      send(res, 200, { locations: LOCATIONS })
      return
    }

    if (url.pathname.startsWith('/bl/')) {
      const authed = requireSession(req, res)
      if (!authed) return
      const blPath = url.pathname.slice(3)
      if (!allowedBridalLivePath(blPath)) {
        send(res, 403, { message: 'That BridalLive request is not allowed.' })
        return
      }
      const headerLoc = String(req.headers['x-helper-location'] ?? '').trim()
      const locationId = LOCATIONS.some((l) => l.id === headerLoc)
        ? headerLoc
        : authed.record.locationId
      const { raw } = await readBody(req)
      const result = await bridalLive.forward({
        locationId,
        method: req.method,
        path: blPath,
        search: url.search,
        body: raw,
        contentType: req.headers['content-type'],
      })
      sendRaw(res, result.status, result.text)
      return
    }

    send(res, 404, { message: 'Not found' })
  } catch (err) {
    const status = Number(err?.status) || 400
    send(res, status, { message: err instanceof Error ? err.message : 'Bad request' })
  }
})

server.listen(PORT, () => {
  const secretsReady = Object.values(LOCATION_SECRETS).every((s) => s.retailerId && s.apiKey)
  console.log(`Helper API http://127.0.0.1:${PORT}`)
  console.log(
    `  users: ${userStore.count()} (file ${path.join(DATA_DIR, 'helper-users.json')})`,
  )
  console.log(
    `  signup: ${userStore.signupConfig().enabled ? (userStore.signupConfig().codeRequired ? 'open with shop code' : 'open') : 'disabled'}`,
  )
  console.log(
    `  BridalLive keys: ${secretsReady ? 'on the server only (proxied, never sent to the extension)' : 'missing in env'}`,
  )
})
