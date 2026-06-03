/** Departments from BL Dept Code (DS / SH / JW). */
export const INVENTORY_DEPARTMENTS = ['Dress', 'Shoes', 'Jewelry'] as const

export type InventoryDepartment = (typeof INVENTORY_DEPARTMENTS)[number]

export type InventorySearchQuery = {
  /** Bridal shop / boutique (`locationId` on catalog rows). Empty = all locations. */
  locationId?: string
  /** Dress, Shoes, or Jewelry — empty = all departments. */
  department?: string
  /** BL Item Name (often a 4-digit style code, e.g. 4554). */
  name?: string
  vendor?: string
  size?: string
  color?: string
  itemNumber?: string
  /** @deprecated Use `name` — kept for older panel payloads. */
  style?: string
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
  /** Phase 2: URL from BridalLive Item Picture API */
  imageUrl?: string
}
