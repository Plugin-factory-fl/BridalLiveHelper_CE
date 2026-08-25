import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserStore } from './users.mjs'

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

const LOCATIONS = [
  { id: 'white-plains', name: 'White Plains' },
  { id: 'poughkeepsie', name: 'Poughkeepsie' },
]

/** Keys stay on the server — never sent to the extension. */
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

/** token → { email, locationId } */
const sessions = new Map()

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(json)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON'))
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

function locationSecrets(locationId) {
  return LOCATION_SECRETS[locationId] ?? { retailerId: '', apiKey: '' }
}

function publicSession(token, record) {
  const user = userStore.get(record.email)
  const secrets = locationSecrets(record.locationId)
  const environment = process.env.BL_ENVIRONMENT === 'qa' ? 'qa' : 'production'
  const ready = Boolean(secrets.retailerId && secrets.apiKey)
  return {
    token,
    user: {
      email: record.email,
      displayName: user?.displayName ?? record.email,
    },
    locationId: record.locationId,
    locations: LOCATIONS,
    bridalLive: ready
      ? {
          retailerId: secrets.retailerId,
          apiKey: secrets.apiKey,
          environment,
        }
      : null,
  }
}

function startSession(email, locationId) {
  const token = crypto.randomUUID()
  const requested = String(locationId ?? '')
  const resolved = LOCATIONS.some((l) => l.id === requested) ? requested : 'poughkeepsie'
  sessions.set(token, { email, locationId: resolved })
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

    if (req.method === 'GET' && url.pathname === '/auth/signup-config') {
      send(res, 200, userStore.signupConfig())
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const body = await readBody(req)
      const email = String(body.email ?? '').trim().toLowerCase()
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
      const body = await readBody(req)
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
      const token = bearer(req)
      const record = sessions.get(token)
      if (!record) {
        send(res, 401, { message: 'Not signed in.' })
        return
      }
      send(res, 200, publicSession(token, record))
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      const token = bearer(req)
      sessions.delete(token)
      send(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/auth/location') {
      const token = bearer(req)
      const record = sessions.get(token)
      if (!record) {
        send(res, 401, { message: 'Not signed in.' })
        return
      }
      const body = await readBody(req)
      const locationId = String(body.locationId ?? '')
      if (!LOCATIONS.some((l) => l.id === locationId)) {
        send(res, 400, { message: 'Unknown location.' })
        return
      }
      record.locationId = locationId
      send(res, 200, publicSession(token, record))
      return
    }

    if (req.method === 'GET' && url.pathname === '/locations') {
      send(res, 200, { locations: LOCATIONS })
      return
    }

    send(res, 404, { message: 'Not found' })
  } catch (err) {
    send(res, 400, { message: err instanceof Error ? err.message : 'Bad request' })
  }
})

server.listen(PORT, () => {
  const secretsReady = Object.values(LOCATION_SECRETS).every((s) => s.retailerId && s.apiKey)
  console.log(`Helper API http://127.0.0.1:${PORT}`)
  console.log(`  users: ${userStore.count()} (file ${path.join(DATA_DIR, 'helper-users.json')}; HELPER_USERS seeds new emails)`)
  console.log(
    `  signup: ${userStore.signupConfig().enabled ? (userStore.signupConfig().codeRequired ? 'open with shop code' : 'open') : 'disabled'}`,
  )
  console.log(`  BridalLive location keys: ${secretsReady ? 'loaded' : 'missing in env (not sent to the extension)'}`)
})
