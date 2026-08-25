import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** email:password:Display Name,email2:password2:Name2 */
function parseUsers() {
  const raw = process.env.HELPER_USERS ?? ''
  const users = new Map()
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [email, password, ...nameParts] = part.split(':')
    if (!email || !password) continue
    users.set(email.trim().toLowerCase(), {
      password,
      displayName: nameParts.join(':').trim() || email,
    })
  }
  return users
}

const USERS = parseUsers()

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

function publicSession(token, record) {
  const user = USERS.get(record.email)
  return {
    token,
    user: {
      email: record.email,
      displayName: user?.displayName ?? record.email,
    },
    locationId: record.locationId,
    locations: LOCATIONS,
  }
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

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const body = await readBody(req)
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const user = USERS.get(email)
      if (!user || user.password !== password) {
        send(res, 401, { message: 'Could not sign in. Check your email and password.' })
        return
      }
      const token = crypto.randomUUID()
      const locationId = 'poughkeepsie'
      sessions.set(token, { email, locationId })
      send(res, 200, publicSession(token, { email, locationId }))
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
  const userCount = USERS.size
  const secretsReady = Object.values(LOCATION_SECRETS).every((s) => s.retailerId && s.apiKey)
  console.log(`Helper API http://127.0.0.1:${PORT}`)
  console.log(`  users: ${userCount} (set HELPER_USERS)`)
  console.log(`  BridalLive location keys: ${secretsReady ? 'loaded' : 'missing in env (not sent to the extension)'}`)
})
