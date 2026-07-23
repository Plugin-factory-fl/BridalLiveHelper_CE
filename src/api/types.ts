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
  /** BridalLive item number — preferred once resolved. */
  itemNumber: string
  quantity: number
  /** Lookup key for reprint (preferred over item # when searching live inventory). */
  vendorItemName?: string
  style?: string
  size?: string
  color?: string
  department?: Department
  retailPrice?: number
  salePrice?: number
}

export type LabelPrintBatchRequest = {
  /** Layout selection or `auto-by-department`. */
  styleLayoutId: string
  items: LabelLineItem[]
  averyStartRow?: number
  averyStartColumn?: number
  /** Avery sheet preset id; defaults to avery-5160. */
  sheetId?: string
  /** Used when reprinting a single item without department on the line. */
  fallbackDepartment?: Department
}

export type LabelPrintBatchResult = {
  ok: boolean
  message: string
  labelCount: number
  pageCount?: number
  pdfOpened?: boolean
}
