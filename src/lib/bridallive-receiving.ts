import { bridalLiveFetch } from './bridallive-auth'
import {
  isLocationConfigured,
  loadBridalLiveApiSettings,
  type BridalLiveLocationCredentials,
} from './bridallive-credentials'
import type { ReceivingVoucherLine } from '../labels/types'

export type BridalLiveReceivingVoucherSummary = {
  id: number
  number: string
  vendorName: string
  status: string
  receiveDate?: string
  locationId: string
  locationName: string
}

type BridalLiveReceivingVoucher = {
  id?: number
  receivingVoucherNumber?: number | string
  vendorName?: string
  status?: string
  receiveDate?: string
  lineItems?: BridalLiveReceivingVoucherItem[]
}

type BridalLiveReceivingVoucherItem = {
  id?: number
  inventoryItemId?: number
  itemNumber?: number | string
  itemName?: string
  itemVendorItemName?: string
  itemSize?: string
  itemColor?: string
  itemColor2?: string
  quantity?: number
  status?: string
  itemDepartmentId?: number
}

type ListResult<T> = {
  result?: T[]
  total?: number
  page?: number
  size?: number
}

function formatVoucherNumber(value: number | string | undefined, id: number): string {
  if (value == null || value === '') return String(id)
  return String(value)
}

function formatItemNumber(value: number | string | undefined): string {
  if (value == null) return ''
  return String(value).trim()
}

function mapVoucherLine(item: BridalLiveReceivingVoucherItem): ReceivingVoucherLine | null {
  const itemNumber = formatItemNumber(item.itemNumber)
  if (!itemNumber) return null
  const qty = Number(item.quantity)
  return {
    itemNumber,
    quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
    style: (item.itemName ?? '').trim() || undefined,
    vendorItemName: (item.itemVendorItemName ?? '').trim() || undefined,
    size: (item.itemSize ?? '').trim() || undefined,
    color: (item.itemColor ?? item.itemColor2 ?? '').trim() || undefined,
    selected: true,
  }
}

async function resolveLocation(
  storeId?: string,
): Promise<BridalLiveLocationCredentials> {
  const settings = await loadBridalLiveApiSettings()
  const configured = settings.locations.filter(isLocationConfigured)
  if (storeId) {
    const match = configured.find((l) => l.id === storeId)
    if (match) return match
  }
  const active = configured.find((l) => l.id === settings.activeLocationId)
  if (active) return active
  if (configured[0]) return configured[0]
  throw new Error(
    'No BridalLive API credentials configured. Add Retailer ID and API key in Settings.',
  )
}

function isOpenStatus(status: string | undefined): boolean {
  const s = (status ?? '').trim().toLowerCase()
  if (!s) return true
  return !/complete|completed|void|cancel|cancelled|closed/.test(s)
}

/**
 * List receiving vouchers for a location (uses that location's API credentials).
 * Prefers open/incomplete vouchers; falls back to recent vouchers if none are open.
 */
export async function listReceivingVouchers(
  storeId?: string,
): Promise<BridalLiveReceivingVoucherSummary[]> {
  const location = await resolveLocation(storeId)
  const data = await bridalLiveFetch<ListResult<BridalLiveReceivingVoucher>>(
    '/api/receivingVouchers/list',
    {
      method: 'POST',
      storeId: location.id,
      query: {
        page: 1,
        size: 50,
        sortField: 'id',
        sortDirection: 'desc',
      },
      body: JSON.stringify({}),
    },
  )

  const rows = (data?.result ?? [])
    .filter((v) => v.id != null)
    .map((v) => ({
      id: v.id!,
      number: formatVoucherNumber(v.receivingVoucherNumber, v.id!),
      vendorName: (v.vendorName ?? '').trim() || 'Unknown vendor',
      status: (v.status ?? '').trim() || 'Unknown',
      receiveDate: v.receiveDate,
      locationId: location.id,
      locationName: location.name,
    }))

  const open = rows.filter((v) => isOpenStatus(v.status))
  return open.length > 0 ? open : rows
}

async function listVoucherItemsViaFilter(
  locationId: string,
  voucherId: number,
): Promise<BridalLiveReceivingVoucherItem[]> {
  const data = await bridalLiveFetch<ListResult<BridalLiveReceivingVoucherItem>>(
    '/api/receivingVoucherItems/list',
    {
      method: 'POST',
      storeId: locationId,
      query: {
        page: 1,
        size: 500,
        sortField: 'sequenceNumber',
        sortDirection: 'asc',
      },
      body: JSON.stringify({ receivingVoucherId: voucherId }),
    },
  )
  return data?.result ?? []
}

/**
 * Load line items for one receiving voucher at a location.
 */
export async function getReceivingVoucherLines(
  voucherId: number,
  storeId?: string,
): Promise<ReceivingVoucherLine[]> {
  const location = await resolveLocation(storeId)

  let items: BridalLiveReceivingVoucherItem[] = []
  try {
    const voucher = await bridalLiveFetch<BridalLiveReceivingVoucher>(
      `/api/receivingVouchers/${voucherId}`,
      {
        method: 'GET',
        storeId: location.id,
      },
    )
    items = voucher?.lineItems ?? []
  } catch {
    items = []
  }

  if (items.length === 0) {
    items = await listVoucherItemsViaFilter(location.id, voucherId)
  }

  return items
    .map(mapVoucherLine)
    .filter((line): line is ReceivingVoucherLine => line != null)
}

/** Convenience: lines for the newest open voucher at a location (or empty). */
export async function getLatestReceivingLines(
  storeId?: string,
): Promise<{
  voucher: BridalLiveReceivingVoucherSummary | null
  lines: ReceivingVoucherLine[]
}> {
  const vouchers = await listReceivingVouchers(storeId)
  const voucher = vouchers[0] ?? null
  if (!voucher) return { voucher: null, lines: [] }
  const lines = await getReceivingVoucherLines(voucher.id, voucher.locationId)
  return { voucher, lines }
}
