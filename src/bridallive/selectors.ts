/**
 * BridalLive DOM selectors — fill in after inspecting the logged-in app.
 * Until set, order-line read/write and form automation stay disabled.
 *
 * @see docs/BRIDALLIVE_CONTEXT.md
 */
export type OrderSelectors = {
  /** Active order line item number input */
  itemNumberInput: string | null
  styleInput: string | null
  sizeInput: string | null
  colorInput: string | null
}

export type ReceivingSelectors = {
  /** Table body rows on an open receiving voucher */
  lineRow: string | null
  lineCheckbox: string | null
  lineItemNumber: string | null
  lineQuantity: string | null
}

export const BL_SELECTORS: {
  order: OrderSelectors
  receiving: ReceivingSelectors
} = {
  order: {
    itemNumberInput: null,
    styleInput: null,
    sizeInput: null,
    colorInput: null,
  },
  receiving: {
    lineRow: null,
    lineCheckbox: null,
    lineItemNumber: null,
    lineQuantity: null,
  },
}

export function orderSelectorsConfigured(): boolean {
  const o = BL_SELECTORS.order
  return Boolean(o.itemNumberInput || o.styleInput || o.sizeInput || o.colorInput)
}

export function receivingSelectorsConfigured(): boolean {
  const r = BL_SELECTORS.receiving
  return Boolean(r.lineRow && r.lineItemNumber && r.lineQuantity)
}
