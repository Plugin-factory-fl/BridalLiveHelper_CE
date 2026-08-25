import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function createSessionStore(dataDir) {
  const filePath = path.join(dataDir, 'helper-sessions.json')
  /** @type {Map<string, { email: string, locationId: string, createdAt: number }>} */
  const sessions = new Map()

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true })
    const payload = {
      sessions: [...sessions.entries()].map(([token, row]) => ({
        token,
        email: row.email,
        locationId: row.locationId,
        createdAt: row.createdAt,
      })),
    }
    const tmp = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, filePath)
  }

  function load() {
    sessions.clear()
    if (!fs.existsSync(filePath)) return
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const list = Array.isArray(raw?.sessions) ? raw.sessions : []
      const cutoff = Date.now() - MAX_AGE_MS
      for (const row of list) {
        const token = String(row?.token ?? '')
        const email = String(row?.email ?? '')
          .trim()
          .toLowerCase()
        const createdAt = Number(row?.createdAt) || 0
        if (!token || !email || createdAt < cutoff) continue
        sessions.set(token, {
          email,
          locationId: String(row.locationId ?? 'poughkeepsie'),
          createdAt,
        })
      }
    } catch (err) {
      console.warn(`Could not read ${filePath}:`, err instanceof Error ? err.message : err)
    }
  }

  load()

  return {
    get(token) {
      const row = sessions.get(String(token ?? ''))
      if (!row) return null
      if (row.createdAt < Date.now() - MAX_AGE_MS) {
        sessions.delete(String(token))
        try {
          persist()
        } catch {
          /* ignore */
        }
        return null
      }
      return row
    },
    create(email, locationId) {
      const token = crypto.randomUUID()
      sessions.set(token, {
        email: String(email).trim().toLowerCase(),
        locationId,
        createdAt: Date.now(),
      })
      persist()
      return token
    },
    setLocation(token, locationId) {
      const row = sessions.get(token)
      if (!row) return null
      row.locationId = locationId
      persist()
      return row
    },
    delete(token) {
      sessions.delete(String(token ?? ''))
      try {
        persist()
      } catch {
        /* ignore */
      }
    },
  }
}
