import type { BridalLiveContext, BridalLiveScreen } from '../types/context'
import { readOrderLineHints } from './order-context'

const SCREEN_LABELS: Record<BridalLiveScreen, string> = {
  order: 'Sale / order',
  receiving: 'Receiving',
  inventory: 'Inventory',
  unknown: 'BridalLive',
}

export function detectContext(): BridalLiveContext {
  const url = location.href
  const pathname = location.pathname.toLowerCase()
  const hash = location.hash.toLowerCase()
  const combined = `${pathname} ${hash} ${document.title.toLowerCase()}`

  let screen: BridalLiveScreen = 'unknown'
  const hints: string[] = []

  if (matchesReceiving(combined)) {
    screen = 'receiving'
    hints.push('Open Labels to print from this receiving voucher.')
  } else if (matchesOrder(combined)) {
    screen = 'order'
    hints.push('Look up a style or add a size and color without leaving this sale.')
  } else if (matchesInventory(combined)) {
    screen = 'inventory'
  } else {
    hints.push('Open a sale, receiving voucher, or inventory page for the most helpful shortcuts.')
  }

  const orderLine = screen === 'order' ? readOrderLineHints() ?? undefined : undefined

  if (screen === 'order' && orderLine) {
    hints.push('Search can be filled in from the line you are working.')
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
