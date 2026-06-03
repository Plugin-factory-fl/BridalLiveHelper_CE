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
  /** BridalLive Item Name column (may repeat across size/color variants). */
  style: string
  vendor: string
  /** Exact sale-search string (vendor code + item number) for BL typeahead. */
  saleSearchQuery: string
  department: string
  size: string
  color: string
  /** Franchise location where this stock row lives. */
  locationId: string
  locationName: string
  onHand: number
}
