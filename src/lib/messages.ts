import type { BridalLiveContext } from '../types/context'
import type { InventoryItem, InventorySearchQuery } from '../types/inventory'
import type { LabelPrintBatchRequest, LabelPrintBatchResult, LabelTemplate } from '../api/types'
import type { ReceivingVoucherLine } from '../labels/types'

export const MSG = {
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
  PANEL_READY: 'PANEL_READY',
  GET_CONTEXT: 'GET_CONTEXT',
  CONTEXT_UPDATE: 'CONTEXT_UPDATE',
  NAVIGATE_PANEL_VIEW: 'NAVIGATE_PANEL_VIEW',
  COPY_TO_CLIPBOARD: 'COPY_TO_CLIPBOARD',
  INVENTORY_SEARCH: 'INVENTORY_SEARCH',
  INVENTORY_LIST_CATALOG: 'INVENTORY_LIST_CATALOG',
  INVENTORY_CHECK_DUPLICATE: 'INVENTORY_CHECK_DUPLICATE',
  INVENTORY_CREATE_VARIANT: 'INVENTORY_CREATE_VARIANT',
  APPLY_ITEM_TO_ORDER: 'APPLY_ITEM_TO_ORDER',
  LABELS_PRINT_BATCH: 'LABELS_PRINT_BATCH',
  LABELS_GET_RECEIVING_LINES: 'LABELS_GET_RECEIVING_LINES',
  LABELS_LIST_TEMPLATES: 'LABELS_LIST_TEMPLATES',
} as const

export type MessageType = (typeof MSG)[keyof typeof MSG]

export type InventorySearchPayload = InventorySearchQuery

export type InventorySearchResponse = {
  items: InventoryItem[]
  duplicateWarning?: string
}

export type InventoryCreateVariantPayload = {
  styleId: string
  size: string
  color: string
  vendorItemName: string
  sourceItemNumber?: string
  sourceInventoryItemId?: string
  sourceLocationId?: string
}

export type InventoryCreateVariantResponse = {
  ok: boolean
  itemNumber?: string
  saleSearchQuery?: string
  message: string
}

export type ExtensionMessage =
  | { type: typeof MSG.OPEN_SIDE_PANEL }
  | { type: typeof MSG.PANEL_READY }
  | { type: typeof MSG.GET_CONTEXT }
  | { type: typeof MSG.CONTEXT_UPDATE; context: BridalLiveContext }
  | { type: typeof MSG.NAVIGATE_PANEL_VIEW; view: string }
  | { type: typeof MSG.COPY_TO_CLIPBOARD; text: string }
  | { type: typeof MSG.INVENTORY_SEARCH; query: InventorySearchPayload }
  | { type: typeof MSG.INVENTORY_LIST_CATALOG }
  | {
      type: typeof MSG.INVENTORY_CHECK_DUPLICATE
      styleId: string
      size: string
      color: string
    }
  | {
      type: typeof MSG.INVENTORY_CREATE_VARIANT
      payload: InventoryCreateVariantPayload
    }
  | {
      type: typeof MSG.APPLY_ITEM_TO_ORDER
      saleSearchQuery: string
      itemNumber?: string
      inventoryItemId?: string
    }
  | { type: typeof MSG.LABELS_PRINT_BATCH; request: LabelPrintBatchRequest }
  | { type: typeof MSG.LABELS_GET_RECEIVING_LINES }
  | { type: typeof MSG.LABELS_LIST_TEMPLATES }

export type ExtensionResponse = {
  ok: boolean
  error?: string
  message?: string
  /** True when sale typeahead had one row and we clicked it to add the line */
  autoSelected?: boolean
  /** How the item was added to the open sale */
  addMethod?: 'api' | 'dom'
  context?: BridalLiveContext
  search?: InventorySearchResponse
  catalogItems?: InventoryItem[]
  variant?: InventoryCreateVariantResponse
  labels?: LabelPrintBatchResult
  receivingLines?: ReceivingVoucherLine[]
  labelTemplates?: LabelTemplate[]
}
