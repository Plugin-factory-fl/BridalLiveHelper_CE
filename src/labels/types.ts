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
}

export type ReceivingVoucherLine = LabelLineItem & {
  department?: Department
  style?: string
  vendor?: string
  selected?: boolean
}

export type LabelPrintOptions = {
  department: Department
  items: LabelLineItem[]
  averyStartRow?: number
  averyStartColumn?: number
  sheetId?: string
}

export type LabelPrintBatchResult = {
  ok: boolean
  message: string
  labelCount: number
  pageCount?: number
  pdfOpened?: boolean
}

export type { LabelLineItem, LabelTemplate }
