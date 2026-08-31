import type { Department } from '../lib/config'
import type { LabelLineItem, LabelTemplate } from '../api/types'

/** One physical label after quantity expansion and field merge. */
export type LabelPayload = {
  itemNumber: string
  style: string
  /** Descriptive name printed on jewelry/shoes tags (not the item #). */
  itemName: string
  vendor: string
  department: Department
  size: string
  color: string
  /** @deprecated Prefer msrp + salePrice — kept for older layouts. */
  price: string
  /** Retail / MSRP, formatted for display (e.g. "$111.99"). */
  msrp: string
  /** Sale price, formatted for display (e.g. "$89.99"). */
  salePrice: string
  /** All available colors / variants for this style (top-left of stock label). */
  variantColors: string[]
  /** Sibling sizes for this style (shoes tag). */
  availableSizes: string[]
  /** Store code printed on tags (e.g. PLM, PK). */
  locationCode: string
  /** Value encoded in the barcode (item number). */
  barcodeValue: string
  /** Resolved drawer id from `style-layouts.ts`. */
  styleLayoutId: string
}

export type ReceivingVoucherLine = LabelLineItem & {
  style?: string
  vendor?: string
  selected?: boolean
}

export type LabelPrintOptions = {
  styleLayoutId: string
  items: LabelLineItem[]
  averyStartRow?: number
  averyStartColumn?: number
  sheetId?: string
  /** Fallback department when a line has none (reprint). */
  fallbackDepartment?: Department
}

export type LabelPrintBatchResult = {
  ok: boolean
  message: string
  labelCount: number
  pageCount?: number
  pdfOpened?: boolean
}

export type { LabelLineItem, LabelTemplate }
