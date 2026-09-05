import type { SpreadsheetInventoryRow } from './spreadsheet/types'
import type { MassLabelPayload } from './mass-types'
import type { LabelLineItem } from '../api/types'
import type { Department } from '../lib/config'
import { DEPARTMENTS } from '../lib/config'

function formatMoney(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return ''
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function sellingPrice(row: SpreadsheetInventoryRow): number | null {
  if (row.salePrice != null && row.salePrice > 0) return row.salePrice
  if (row.retailPrice != null && row.retailPrice > 0) return row.retailPrice
  return row.retailPrice ?? row.salePrice
}

export function rowToMassPayload(row: SpreadsheetInventoryRow): MassLabelPayload {
  const itemNumber = row.itemNumber || row.itemName
  const sale = sellingPrice(row)
  const retail = row.retailPrice
  const showOrig =
    retail != null &&
    retail > 0 &&
    sale != null &&
    Math.abs(retail - sale) > 0.001

  return {
    itemName: row.itemName || row.vendorItemName || itemNumber,
    deptCode: row.deptCode,
    vendorCode: row.vendorCode,
    color: row.color,
    size: row.size,
    salePrice: formatMoney(sale),
    origPrice: showOrig ? `orig:${formatMoney(retail)}` : '',
    itemNumber,
    barcodeValue: itemNumber,
  }
}

export function expandMassSelectedRows(
  rows: SpreadsheetInventoryRow[],
  copiesFromQty: boolean,
): MassLabelPayload[] {
  const out: MassLabelPayload[] = []
  for (const row of rows) {
    if (!row.selected) continue
    const payload = rowToMassPayload(row)
    const copies = copiesFromQty ? Math.max(1, row.quantity || 1) : 1
    for (let i = 0; i < copies; i++) out.push({ ...payload })
  }
  return out
}

export function formatMassMoney(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function asDepartment(value: string | undefined): Department | undefined {
  if (value && (DEPARTMENTS as readonly string[]).includes(value)) {
    return value as Department
  }
  return undefined
}

export function scanRowToLabelLine(
  row: SpreadsheetInventoryRow,
  copiesFromQty: boolean,
): LabelLineItem {
  return {
    itemNumber: row.itemNumber,
    quantity: copiesFromQty ? Math.max(1, row.quantity || 1) : 1,
    vendorItemName: row.vendorItemName || undefined,
    style: row.itemName || undefined,
    size: row.size || undefined,
    color: row.color || undefined,
    department: asDepartment(row.department),
    retailPrice: row.retailPrice ?? undefined,
    salePrice: row.salePrice ?? undefined,
  }
}

export function expandScanRowsToLabelLines(
  rows: SpreadsheetInventoryRow[],
  copiesFromQty: boolean,
): LabelLineItem[] {
  return rows
    .filter((row) => row.selected && row.matched !== false)
    .map((row) => scanRowToLabelLine(row, copiesFromQty))
}
