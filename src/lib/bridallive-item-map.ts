import type { InventoryItem } from '../types/inventory'
import { buildSaleSearchQuery } from '../inventory/sale-search-query'
import type { BridalLiveLocationCredentials } from '../lib/bridallive-credentials'

/** Subset of BridalLive Item fields used by the helper. */
export type BridalLiveItem = {
  id?: number
  version?: number
  name?: string
  vendorItemName?: string
  vendorName?: string
  vendorId?: number
  vendorCode?: string
  itemNumber?: number | string
  itemNumberString?: string
  departmentId?: number
  departmentCode?: string
  departmentName?: string
  size?: string
  sizeString?: string
  color?: string
  colorString?: string
  color2?: string
  quantityOnHand?: number
  regularPrice?: number
  salePrice?: number
  currentPrice?: number
  cost?: number
  description?: string
  status?: string
  inventoryItem?: boolean
  notes?: string
  taxCodeId?: number
  colorGroupId?: number
  sizeGroupId?: number
  itemCategoryId?: number
  itemPictureImageUrl?: string
  reorderPoint?: number
  retailerId?: string
  [key: string]: unknown
}

export type BridalLiveItemListResult = {
  page?: number
  size?: number
  total?: number
  result?: BridalLiveItem[]
}

export function formatItemNumber(item: BridalLiveItem): string {
  if (item.itemNumberString != null && String(item.itemNumberString).trim()) {
    return String(item.itemNumberString).trim()
  }
  if (item.itemNumber != null && String(item.itemNumber).trim()) {
    return String(item.itemNumber).trim()
  }
  return ''
}

export function mapDepartmentName(item: BridalLiveItem): string {
  const name = (item.departmentName ?? '').trim()
  if (name) return name
  const code = (item.departmentCode ?? '').trim().toUpperCase()
  if (code === 'DS' || code === 'DR') return 'Dress'
  if (code === 'SH') return 'Shoes'
  if (code === 'JW') return 'Jewelry'
  return name || 'Dress'
}

export function mapBridalLiveItem(
  item: BridalLiveItem,
  location: BridalLiveLocationCredentials,
): InventoryItem {
  const itemNumber = formatItemNumber(item)
  const vendor = (item.vendorName ?? item.vendorCode ?? '').trim() || 'Unknown vendor'
  const style = (item.name ?? '').trim() || itemNumber || 'Untitled'
  return {
    id: item.id != null ? String(item.id) : `bl-${itemNumber || crypto.randomUUID()}`,
    itemNumber,
    style,
    vendorItemName: (item.vendorItemName ?? '').trim() || style,
    description: (item.description ?? '').trim() || undefined,
    vendor,
    saleSearchQuery: buildSaleSearchQuery(vendor, itemNumber),
    department: mapDepartmentName(item),
    size: (item.size ?? item.sizeString ?? '').trim(),
    color: (item.color ?? item.colorString ?? '').trim(),
    locationId: location.id,
    locationName: location.name,
    onHand: Number(item.quantityOnHand ?? 0) || 0,
    retailPrice:
      item.regularPrice != null && Number.isFinite(Number(item.regularPrice))
        ? Number(item.regularPrice)
        : undefined,
    salePrice:
      item.salePrice != null && Number.isFinite(Number(item.salePrice))
        ? Number(item.salePrice)
        : item.currentPrice != null && Number.isFinite(Number(item.currentPrice))
          ? Number(item.currentPrice)
          : undefined,
    imageUrl: item.itemPictureImageUrl || undefined,
  }
}

/** Build a create payload by cloning a source item with a new size/color. */
export function buildVariantCreateBody(
  source: BridalLiveItem,
  size: string,
  color: string,
  options?: { vendorItemName?: string; name?: string },
): BridalLiveItem {
  const omit = new Set([
    'id',
    'version',
    'createdDate',
    'createdByUser',
    'modifiedDate',
    'modifiedByUser',
    'itemNumber',
    'itemNumberString',
    'quantityOnHand',
    'quantityAwaitingPickup',
    'quantityOnPendingPurchaseOrders',
    'quantityOnAllTrxInAlterations',
    'quantityOnCompleteTrxButAwaitingPickup',
    'quantityOnPendingTrxInAlterations',
    'additionalImages',
    'attributes',
    'itemAddOns',
    'attrCount',
    'nbrAttributes',
    'nbrPictures',
    'nbrItemsLinked',
    'qbEditSequence',
    'qbListId',
    'qbSyncStatus',
    'tokenRetailerId',
    'trxId',
    // Do not copy media / upload leftovers onto a new SKU.
    'itemPictureImageUrl',
    'itemPictureId',
    'imageUrl',
  ])

  const body: BridalLiveItem = {}
  for (const [key, value] of Object.entries(source)) {
    if (omit.has(key)) continue
    if (value === undefined) continue
    body[key] = value
  }

  const vendorItemName = (options?.vendorItemName ?? source.vendorItemName ?? '').trim()
  const name = (options?.name ?? source.name ?? '').trim()

  body.size = size
  body.sizeString = size
  body.color = color
  body.colorString = color
  body.quantityOnHand = 0
  body.inventoryItem = true
  body.nonInventoryItem = false
  if (name) body.name = name
  if (vendorItemName) body.vendorItemName = vendorItemName
  // New variants should appear in normal inventory searches.
  if (!body.status || String(body.status).trim() === '') {
    body.status = 'Active'
  }

  return body
}
