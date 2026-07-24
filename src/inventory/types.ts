import type { InventoryItem, InventorySearchQuery } from '../types/inventory'

export type InventorySearchResult = {
  items: InventoryItem[]
  duplicateWarning?: string
}

export type InventoryCreateVariantPayload = {
  styleId: string
  size: string
  color: string
  /** BridalLive Vendor Item Name — required so the new row is searchable/usable. */
  vendorItemName: string
  sourceItemNumber?: string
  /** BridalLive inventory item id of the source row (preferred for a full GET clone). */
  sourceInventoryItemId?: string
  /** Location that owns the source item (WP / PK). */
  sourceLocationId?: string
}

export type InventoryCreateVariantResult = {
  ok: boolean
  itemNumber?: string
  saleSearchQuery?: string
  message: string
}

export type { InventoryItem, InventorySearchQuery }
