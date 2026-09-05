export type SpreadsheetKind = 'inventory-export' | 'scan-gun'

export type SpreadsheetInventoryRow = {
  id: number
  itemNumber: string
  vendorCode: string
  deptCode: string
  itemName: string
  description: string
  longDescription: string
  vendorItemName: string
  color: string
  size: string
  quantity: number
  retailPrice: number | null
  salePrice: number | null
  selected: boolean
  /** BridalLive department after a scan-gun lookup. */
  department?: string
  /** Set after matching a scan list to BridalLive. */
  matched?: boolean
}

export type SpreadsheetColumnKey =
  | 'itemNumber'
  | 'vendorCode'
  | 'deptCode'
  | 'itemName'
  | 'description'
  | 'longDescription'
  | 'vendorItemName'
  | 'color'
  | 'size'
  | 'quantity'
  | 'retailPrice'
  | 'salePrice'

export type SpreadsheetColumnMap = Partial<Record<SpreadsheetColumnKey, number>>

export type SpreadsheetParseResult = {
  fileName: string
  sheetName: string
  headerRow: number
  mapped: SpreadsheetColumnMap
  rows: SpreadsheetInventoryRow[]
  skippedRows: number
  kind: SpreadsheetKind
  /** Total scan-gun reads before collapsing duplicates. */
  scanCount?: number
}
