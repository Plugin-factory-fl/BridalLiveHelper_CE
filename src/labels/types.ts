import type { Department } from '../lib/config'
import type { LabelLineItem, LabelTemplate } from '../api/types'

/** One physical label after quantity expansion and field merge. */
export type LabelPayload = {
  itemNumber: string
  style: string
  vendor: string
  department: Department
  size: string
  color: string
  price: string
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
