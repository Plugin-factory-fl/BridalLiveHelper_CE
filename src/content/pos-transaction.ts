import { log, warn } from '../lib/log'

type AngularScope = {
  $parent?: AngularScope
  $$childHead?: AngularScope | null
  $$nextSibling?: AngularScope | null
  [key: string]: unknown
}

type AngularGlobal = {
  element: (el: Element) => { scope: () => AngularScope }
}

export type OpenPosTransactionRef = {
  /** BridalLive internal POS transaction id (for addLineItem). */
  id?: number
  /** Visible sale number (Sale #24818). */
  trxNumber?: number
}

function getAngular(): AngularGlobal | undefined {
  const w = window as Window & { angular?: AngularGlobal }
  return w.angular
}

function walkScopes(scope: AngularScope | null | undefined, visit: (s: AngularScope) => void): void {
  if (!scope) return
  visit(scope)
  walkScopes(scope.$$childHead ?? null, visit)
  walkScopes(scope.$$nextSibling ?? null, visit)
}

function asPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.trunc(n)
}

function looksLikePosTransaction(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  const id = asPositiveInt(obj.id)
  if (!id) return false
  return (
    obj.lineItems != null ||
    obj.trxNumber != null ||
    obj.typeId != null ||
    obj.contactId != null ||
    obj.trxStatus != null ||
    obj.status != null
  )
}

function readTrxNumberFromDocument(): number | undefined {
  const title = document.title
  const titleMatch = title.match(/\b(?:sale|trx|transaction)\s*#?\s*(\d+)\b/i)
  if (titleMatch) return asPositiveInt(titleMatch[1])

  const heading = document.querySelector('h1, h2, .page-header, .trx-number, [class*="trx"]')
  const headingText = heading?.textContent ?? ''
  const headingMatch = headingText.match(/\b(?:sale|trx|transaction)\s*#?\s*(\d+)\b/i)
  if (headingMatch) return asPositiveInt(headingMatch[1])

  const bodyMatch = document.body.innerText.slice(0, 4000).match(
    /\b(?:sale|transaction)\s*#\s*(\d+)\b/i,
  )
  return bodyMatch ? asPositiveInt(bodyMatch[1]) : undefined
}

function readIdFromUrl(): number | undefined {
  const candidates = [location.hash, location.pathname, location.href]
  for (const text of candidates) {
    const patterns = [
      /posTransactions?\/(\d+)/i,
      /transactions?\/(\d+)/i,
      /\/sale\/(\d+)/i,
      /trxId[=:](\d+)/i,
      /transactionId[=:](\d+)/i,
    ]
    for (const re of patterns) {
      const m = text.match(re)
      if (m) return asPositiveInt(m[1])
    }
  }
  return undefined
}

/**
 * Best-effort read of the open POS sale from Angular scope / URL / title.
 * `id` is preferred for API addLineItem; `trxNumber` can be resolved via list.
 */
export function readOpenPosTransaction(): OpenPosTransactionRef | null {
  const fromUrl = readIdFromUrl()
  const fromDoc = readTrxNumberFromDocument()
  let fromScope: OpenPosTransactionRef | null = null

  const angular = getAngular()
  if (angular) {
    const candidates: OpenPosTransactionRef[] = []
    const visit = (scope: AngularScope) => {
      for (const key of Object.keys(scope)) {
        if (key.startsWith('$') || key.startsWith('$$')) continue
        let value: unknown
        try {
          value = scope[key]
        } catch {
          continue
        }
        if (!looksLikePosTransaction(value)) continue
        const obj = value as Record<string, unknown>
        candidates.push({
          id: asPositiveInt(obj.id),
          trxNumber: asPositiveInt(obj.trxNumber),
        })
      }
    }

    try {
      walkScopes(angular.element(document.body).scope(), visit)
    } catch (e) {
      warn('readOpenPosTransaction scope walk failed', e)
    }

    // Prefer candidates that include a trxNumber matching the visible sale #.
    fromScope =
      (fromDoc
        ? candidates.find((c) => c.trxNumber === fromDoc && c.id)
        : undefined) ??
      candidates.find((c) => c.id && c.trxNumber) ??
      candidates.find((c) => c.id) ??
      null
  }

  const id = fromScope?.id ?? fromUrl
  const trxNumber = fromScope?.trxNumber ?? fromDoc

  if (!id && !trxNumber) {
    log('readOpenPosTransaction: none found')
    return null
  }

  log('readOpenPosTransaction', { id, trxNumber })
  return { id, trxNumber }
}
