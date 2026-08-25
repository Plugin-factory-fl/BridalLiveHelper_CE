import type { SpreadsheetColumnKey } from './types'

/**
 * Exact header names after normalizeHeader().
 * First alias that matches an unused column wins — order is a preference list.
 */
const ALIASES: Record<SpreadsheetColumnKey, string[]> = {
  itemNumber: ['barcode', 'item #', 'item no', 'item number', 'itemnum', 'sku'],
  vendorCode: ['vendor code', 'vendorcode'],
  deptCode: ['dept code', 'department code'],
  itemName: ['item name'],
  description: ['description'],
  longDescription: ['long description', 'long desc'],
  vendorItemName: ['vendor item name'],
  color: ['color', 'colour'],
  size: ['size'],
  quantity: ['o h qty', 'oh qty', 'o/h qty', 'on hand qty', 'quantity'],
  retailPrice: ['retail price', 'msrp'],
  salePrice: ['sale price'],
}

/** Headers that must never be used for a shorter alias (exact match only). */
const BLOCKED: Partial<Record<SpreadsheetColumnKey, string[]>> = {
  color: ['accent color'],
  description: ['long description', 'long desc'],
  quantity: ['in stock', 'in stock read only', 'reorder point'],
  retailPrice: ['order cost', 'inventory cost', 'sale price'],
  itemNumber: [],
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBlocked(key: SpreadsheetColumnKey, header: string): boolean {
  return (BLOCKED[key] ?? []).some((blocked) => header === normalizeHeader(blocked))
}

function scoreHeader(header: string, alias: string): number {
  const want = normalizeHeader(alias)
  if (!want || !header) return 0
  if (header === want) return 1000 + want.length
  return 0
}

export function detectHeaderRow(rows: unknown[][]): number {
  let bestIndex = 0
  let bestScore = -1
  const limit = Math.min(rows.length, 25)

  for (let i = 0; i < limit; i++) {
    const cells = rows[i] ?? []
    let score = 0
    for (const cell of cells) {
      const header = normalizeHeader(cell)
      if (!header) continue
      for (const aliases of Object.values(ALIASES)) {
        for (const alias of aliases) {
          score += scoreHeader(header, alias)
        }
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

export function mapColumns(headerRow: unknown[]): Partial<Record<SpreadsheetColumnKey, number>> {
  const mapped: Partial<Record<SpreadsheetColumnKey, number>> = {}
  const used = new Set<number>()
  const headers = headerRow.map((cell) => normalizeHeader(cell))

  for (const [key, aliases] of Object.entries(ALIASES) as Array<[SpreadsheetColumnKey, string[]]>) {
    for (const alias of aliases) {
      const want = normalizeHeader(alias)
      const col = headers.findIndex(
        (header, index) => !used.has(index) && header === want && !isBlocked(key, header),
      )
      if (col >= 0) {
        mapped[key] = col
        used.add(col)
        break
      }
    }
  }

  return mapped
}
