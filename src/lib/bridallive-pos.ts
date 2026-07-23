import { bridalLiveFetch, getBridalLiveSession } from './bridallive-auth'
import type { BridalLiveItem, BridalLiveItemListResult } from './bridallive-item-map'
import { formatItemNumber } from './bridallive-item-map'

export type AddLineItemResult = {
  ok: boolean
  message: string
  trxNumber?: number
  itemNumber?: string
}

function asItemNumber(value: string): number | string {
  const n = Number(value)
  if (Number.isFinite(n) && String(n) === value.trim()) return n
  return value.trim()
}

/** Prefer a real sale price; treat 0/absent as “not on sale” (same as label enrich). */
function positivePrice(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

function resolveLinePrice(item: BridalLiveItem): number | undefined {
  return (
    positivePrice(item.salePrice) ??
    positivePrice(item.currentPrice) ??
    positivePrice(item.regularPrice)
  )
}

async function findInventoryItem(
  itemNumber: string,
  inventoryItemId: string | undefined,
  storeId?: string,
): Promise<BridalLiveItem | null> {
  if (inventoryItemId && /^\d+$/.test(inventoryItemId)) {
    try {
      const item = await bridalLiveFetch<BridalLiveItem>(`/api/items/${inventoryItemId}`, {
        method: 'GET',
        storeId,
      })
      if (item?.id != null) return item
    } catch {
      /* fall through to list lookup */
    }
  }

  const filter: BridalLiveItem = {}
  const asNum = Number(itemNumber)
  if (Number.isFinite(asNum) && String(asNum) === itemNumber.trim()) {
    filter.itemNumber = asNum
  } else {
    filter.itemNumberString = itemNumber.trim()
  }

  const data = await bridalLiveFetch<BridalLiveItemListResult>('/api/items/list', {
    method: 'POST',
    storeId,
    query: { page: 1, size: 25, sortField: 'id', sortDirection: 'asc' },
    body: JSON.stringify(filter),
  })

  const want = itemNumber.trim()
  return (
    data?.result?.find((row) => formatItemNumber(row) === want) ??
    data?.result?.[0] ??
    null
  )
}

async function resolveTransactionId(
  posTransactionId: number | undefined,
  trxNumber: number | undefined,
  storeId?: string,
): Promise<{ id: number; trxNumber?: number } | null> {
  if (posTransactionId && Number.isFinite(posTransactionId)) {
    return { id: posTransactionId, trxNumber }
  }
  if (trxNumber == null || !Number.isFinite(trxNumber)) return null

  type TxList = {
    result?: Array<{ id?: number; trxNumber?: number; status?: string }>
    total?: number
  }

  const data = await bridalLiveFetch<TxList>('/api/posTransactions/list', {
    method: 'POST',
    storeId,
    query: { page: 1, size: 25, sortField: 'id', sortDirection: 'desc' },
    body: JSON.stringify({ trxNumber }),
  })

  const match =
    data?.result?.find((row) => Number(row.trxNumber) === Number(trxNumber)) ??
    data?.result?.[0]
  if (match?.id == null) return null
  return { id: match.id, trxNumber: match.trxNumber ?? trxNumber }
}

/**
 * Add an inventory item to an open POS transaction via BridalLive API
 * (`POST /api/posTransactions/{id}/addLineItem`).
 */
export async function addInventoryItemToPosTransaction(options: {
  itemNumber: string
  inventoryItemId?: string
  posTransactionId?: number
  trxNumber?: number
  storeId?: string
}): Promise<AddLineItemResult> {
  const itemNumber = options.itemNumber.trim()
  if (!itemNumber) {
    return { ok: false, message: 'Item number is required to add to the sale.' }
  }

  await getBridalLiveSession(options.storeId)

  const trx = await resolveTransactionId(
    options.posTransactionId,
    options.trxNumber,
    options.storeId,
  )
  if (!trx) {
    return {
      ok: false,
      message:
        'Could not resolve the open sale transaction id. Stay on the sale screen and try again.',
    }
  }

  const item = await findInventoryItem(
    itemNumber,
    options.inventoryItemId,
    options.storeId,
  )
  if (!item?.id) {
    return {
      ok: false,
      message: `Could not find inventory item ${itemNumber} via BridalLive API.`,
    }
  }

  const resolvedNumber = formatItemNumber(item) || itemNumber
  const regularPrice = positivePrice(item.regularPrice)
  const salePrice = positivePrice(item.salePrice)
  const price = resolveLinePrice(item)
  if (price == null) {
    return {
      ok: false,
      message: `Item #${resolvedNumber} has no usable price in BridalLive inventory — add/fix the price there, then try again.`,
    }
  }

  const lineItem = {
    inventoryItemId: item.id,
    inventoryItem: true,
    isInventoryItem: true,
    itemNumber: asItemNumber(resolvedNumber),
    itemName: item.name,
    itemVendorItemName: item.vendorItemName,
    vendorName: item.vendorName,
    itemVendorId: item.vendorId,
    itemSize: item.size ?? item.sizeString,
    itemColor: item.color ?? item.colorString,
    colorString: item.colorString ?? item.color,
    itemDepartmentId: item.departmentId,
    itemRegularPrice: regularPrice ?? price,
    itemSalePrice: salePrice,
    price,
    quantity: 1,
    taxCodeId: item.taxCodeId,
  }

  await bridalLiveFetch(`/api/posTransactions/${trx.id}/addLineItem`, {
    method: 'POST',
    storeId: options.storeId,
    body: JSON.stringify(lineItem),
  })

  return {
    ok: true,
    itemNumber: resolvedNumber,
    trxNumber: trx.trxNumber,
    message: `Added item #${resolvedNumber} to sale${trx.trxNumber ? ` #${trx.trxNumber}` : ''} via BridalLive API.`,
  }
}
