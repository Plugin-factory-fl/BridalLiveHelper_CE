import type { BridalLiveContext, BridalLiveScreen } from '../types/context'
import { readOrderLineHints } from './order-context'
import { orderSelectorsConfigured } from '../bridallive/selectors'

const SCREEN_LABELS: Record<BridalLiveScreen, string> = {
  order: 'Order / POS',
  receiving: 'Receiving voucher',
  inventory: 'Inventory',
  unknown: 'Unknown screen',
}

export function detectContext(
  devOverride: BridalLiveScreen | null = null,
): BridalLiveContext {
  const url = location.href
  const pathname = location.pathname.toLowerCase()
  const hash = location.hash.toLowerCase()
  const combined = `${pathname} ${hash} ${document.title.toLowerCase()}`

  let screen: BridalLiveScreen = 'unknown'
  const hints: string[] = []

  if (devOverride) {
    screen = devOverride
    hints.push('Developer screen override active')
  } else if (matchesReceiving(combined)) {
    screen = 'receiving'
    hints.push('Bulk label printing will target lines on this voucher.')
  } else if (matchesOrder(combined)) {
    screen = 'order'
    hints.push('Use Inventory to look up or add size/color without leaving this order.')
  } else if (matchesInventory(combined)) {
    screen = 'inventory'
    hints.push('Reprint labels or verify item numbers from inventory.')
  } else {
    hints.push('Navigate to an order, receiving voucher, or inventory screen for best results.')
  }

  const orderLine =
    screen === 'order' || devOverride === 'order' ? readOrderLineHints() ?? undefined : undefined

  if (screen === 'order' && orderLine) {
    hints.push('Order line detected — search fields can be prefilled from the active line.')
  } else if (screen === 'order' && !orderSelectorsConfigured()) {
    hints.push(
      'Order line selectors not configured yet; copy item # manually or add selectors in the extension.',
    )
  }

  return {
    screen,
    screenLabel: SCREEN_LABELS[screen],
    url,
    title: document.title,
    hints,
    detectedAt: Date.now(),
    orderLine,
  }
}

function matchesReceiving(text: string): boolean {
  return (
    /receiv/.test(text) ||
    /voucher/.test(text) ||
    /goods.?receipt/.test(text)
  )
}

function matchesOrder(text: string): boolean {
  return (
    /\/order/.test(text) ||
    /\border\b/.test(text) ||
    /pos/.test(text) ||
    /special.?order/.test(text) ||
    /transaction/.test(text) ||
    /sale/.test(text)
  )
}

function matchesInventory(text: string): boolean {
  return (
    /\/inventory/.test(text) ||
    /\binventory\b/.test(text) ||
    /\/item/.test(text) ||
    /\bitems?\b/.test(text) ||
    /product/.test(text)
  )
}

export function parseDevScreenOverride(value: string | null): BridalLiveScreen | null {
  if (!value) return null
  const allowed: BridalLiveScreen[] = ['order', 'receiving', 'inventory', 'unknown']
  return allowed.includes(value as BridalLiveScreen) ? (value as BridalLiveScreen) : null
}
