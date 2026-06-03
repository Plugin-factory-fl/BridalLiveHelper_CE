import type { InventoryItem, InventorySearchQuery } from '../types/inventory'

export type InventorySearchResult = {
  items: InventoryItem[]
  duplicateWarning?: string
}

export type InventoryCreateVariantPayload = {
  styleId: string
  size: string
  color: string
  sourceItemNumber?: string
}

export type InventoryCreateVariantResult = {
  ok: boolean
  itemNumber?: string
  saleSearchQuery?: string
  message: string
}

export type { InventoryItem, InventorySearchQuery }
