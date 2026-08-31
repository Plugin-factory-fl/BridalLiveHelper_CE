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
  /** BL Vendor Item Name (private label / manufacturer name — often differs from Item Name). */
  vendorItemName?: string
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
  /** BridalLive Vendor Item Name (private labeling; often differs from Item Name). */
  vendorItemName: string
  /** BridalLive Description — used as the printed name when Item Name is just the item #. */
  description?: string
  vendor: string
  /** BridalLive vendor code / vendor ID. */
  vendorCode?: string
  /** Exact sale-search string (vendor code + item number) for BL typeahead. */
  saleSearchQuery: string
  department: string
  size: string
  color: string
  /** Franchise location where this stock row lives. */
  locationId: string
  locationName: string
  onHand: number
  /** BridalLive Retail Price (MSRP). */
  retailPrice?: number
  /** BridalLive Sale Price. */
  salePrice?: number
  /**
   * Available color / variant names for this style (from BL Description
   * color list, or aggregated from sibling catalog rows).
   */
  availableColors?: string[]
  /** Phase 2: URL from BridalLive Item Picture API */
  imageUrl?: string
}
