export type BridalLiveScreen =
  | 'order'
  | 'receiving'
  | 'inventory'
  | 'unknown'

/** Fields read from the active order line (when selectors are configured). */
export type OrderLineHints = {
  itemNumber?: string
  style?: string
  size?: string
  color?: string
}

export type BridalLiveContext = {
  screen: BridalLiveScreen
  screenLabel: string
  url: string
  title: string
  hints: string[]
  detectedAt: number
  /** Present on order screens when DOM selectors match. */
  orderLine?: OrderLineHints
}
