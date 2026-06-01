export type InventorySearchQuery = {
  style?: string
  vendor?: string
  size?: string
  color?: string
  itemNumber?: string
}

export type InventoryItem = {
  id: string
  itemNumber: string
  style: string
  vendor: string
  department: string
  size: string
  color: string
  /** Franchise location where this stock row lives. */
  locationId: string
  locationName: string
  onHand: number
}
