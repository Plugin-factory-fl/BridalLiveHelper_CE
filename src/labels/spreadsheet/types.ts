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
}
