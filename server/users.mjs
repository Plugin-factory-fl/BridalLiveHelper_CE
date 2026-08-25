import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SCRYPT_KEYLEN = 32

function parseEnvUsers(raw) {
  const users = []
  for (const part of String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [email, password, ...nameParts] = part.split(':')
    if (!email || !password) continue
    users.push({
      email: email.trim().toLowerCase(),
      password,
      displayName: nameParts.join(':').trim() || email.trim(),
    })
  }
  return users
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false
  const [saltHex, hashHex] = String(stored).split(':')
  if (!saltHex || !hashHex) return false
  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function codesMatch(provided, expected) {
  const a = Buffer.from(String(provided ?? ''), 'utf8')
  const b = Buffer.from(String(expected ?? ''), 'utf8')
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  return crypto.timingSafeEqual(a, b)
}

export function createUserStore(options) {
  const dataDir = options.dataDir
  const filePath = path.join(dataDir, 'helper-users.json')
  const signupCode = String(options.signupCode ?? '').trim()
  const signupEnabled = options.signupEnabled !== false

  /** @type {Map<string, { email: string, displayName: string, passwordHash: string, createdAt: string }>} */
  const users = new Map()

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true })
    const payload = {
      users: [...users.values()].map((u) => ({
        email: u.email,
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        createdAt: u.createdAt,
      })),
    }
    const tmp = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, filePath)
  }

  function load() {
    users.clear()
    if (!fs.existsSync(filePath)) return
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const list = Array.isArray(raw?.users) ? raw.users : Array.isArray(raw) ? raw : []
      for (const row of list) {
        const email = String(row?.email ?? '')
          .trim()
          .toLowerCase()
        const passwordHash = String(row?.passwordHash ?? '')
        if (!email || !passwordHash) continue
        users.set(email, {
          email,
          displayName: String(row.displayName ?? email).trim() || email,
          passwordHash,
          createdAt: String(row.createdAt ?? new Date().toISOString()),
        })
      }
    } catch (err) {
      console.warn(`Could not read ${filePath}:`, err instanceof Error ? err.message : err)
    }
  }

  function seedFromEnv() {
    let changed = false
    for (const row of parseEnvUsers(options.envUsersRaw)) {
      if (users.has(row.email)) continue
      users.set(row.email, {
        email: row.email,
        displayName: row.displayName,
        passwordHash: hashPassword(row.password),
        createdAt: new Date().toISOString(),
      })
      changed = true
    }
    if (changed) persist()
  }

  load()
  try {
    seedFromEnv()
  } catch (err) {
    console.warn('Could not save seeded helper users:', err instanceof Error ? err.message : err)
  }

  return {
    count() {
      return users.size
    },
    signupConfig() {
      return {
        enabled: signupEnabled,
        codeRequired: Boolean(signupCode),
      }
    },
    get(email) {
      return users.get(String(email ?? '').trim().toLowerCase()) ?? null
    },
    authenticate(email, password) {
      const user = this.get(email)
      if (!user || !verifyPassword(password, user.passwordHash)) return null
      return { email: user.email, displayName: user.displayName }
    },
    register({ email, password, displayName, signupCode: providedCode }) {
      if (!signupEnabled) {
        return { ok: false, status: 403, message: 'New accounts are turned off. Ask a manager to add you.' }
      }
      if (signupCode && !codesMatch(String(providedCode ?? '').trim(), signupCode)) {
        return { ok: false, status: 403, message: 'That shop code is not right.' }
      }
      const normalized = String(email ?? '')
        .trim()
        .toLowerCase()
      if (!EMAIL_RE.test(normalized)) {
        return { ok: false, status: 400, message: 'Enter a valid email address.' }
      }
      if (String(password ?? '').length < 8) {
        return { ok: false, status: 400, message: 'Use a password with at least 8 characters.' }
      }
      if (users.has(normalized)) {
        return { ok: false, status: 409, message: 'An account with that email already exists. Sign in instead.' }
      }
      const name = String(displayName ?? '').trim() || normalized.split('@')[0]
      if (name.length > 80) {
        return { ok: false, status: 400, message: 'That name is too long.' }
      }
      const record = {
        email: normalized,
        displayName: name,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      }
      users.set(normalized, record)
      try {
        persist()
      } catch (err) {
        users.delete(normalized)
        return {
          ok: false,
          status: 500,
          message: 'Could not save the new account. Try again, or ask Alex to check the Helper server.',
        }
      }
      return { ok: true, user: { email: record.email, displayName: record.displayName } }
    },
  }
}
