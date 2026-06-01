import { BL_SELECTORS } from '../bridallive/selectors'
import type { OrderLineHints } from '../types/context'

function readInput(selector: string | null): string | undefined {
  if (!selector) return undefined
  const el = document.querySelector(selector)
  if (!el) return undefined
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const v = el.value.trim()
    return v || undefined
  }
  const text = el.textContent?.trim()
  return text || undefined
}

/** Reads the active order line from BridalLive when selectors are configured. */
export function readOrderLineHints(): OrderLineHints | null {
  const { order } = BL_SELECTORS
  const itemNumber = readInput(order.itemNumberInput)
  const style = readInput(order.styleInput)
  const size = readInput(order.sizeInput)
  const color = readInput(order.colorInput)

  if (!itemNumber && !style && !size && !color) return null

  return { itemNumber, style, size, color }
}

export function applyItemNumberToOrder(itemNumber: string): { ok: boolean; error?: string } {
  const selector = BL_SELECTORS.order.itemNumberInput
  if (!selector) {
    return {
      ok: false,
      error: 'Order item # selector not configured. See docs/BRIDALLIVE_CONTEXT.md.',
    }
  }

  const el = document.querySelector(selector)
  if (!el || !(el instanceof HTMLInputElement)) {
    return { ok: false, error: `Selector not found: ${selector}` }
  }

  el.focus()
  el.value = itemNumber
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true }
}
