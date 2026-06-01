import type { Department } from '../lib/config'

export type Store = {
  id: string
  name: string
}

export type UserRole = 'store' | 'admin'

export type AuthSession = {
  userId: string
  role: UserRole
  storeId: string | null
  email: string
}

export type LabelTemplate = {
  id: string
  department: Department
  name: string
  widthIn: number
  heightIn: number
}

export type LabelLineItem = {
  itemNumber: string
  quantity: number
  style?: string
  size?: string
  color?: string
}

export type LabelPrintBatchRequest = {
  department: Department
  items: LabelLineItem[]
  averyStartRow?: number
  averyStartColumn?: number
  /** Avery sheet preset id; defaults to avery-5160. */
  sheetId?: string
}

export type LabelPrintBatchResult = {
  ok: boolean
  message: string
  labelCount: number
  pageCount?: number
  pdfOpened?: boolean
}
