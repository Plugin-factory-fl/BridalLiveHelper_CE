import { STORAGE_KEYS } from './config'

/** Columns that can be shown/hidden in inventory results (Actions always stay). */
export const INVENTORY_COLUMN_IDS = [
  'name',
  'vendorItemName',
  'itemNumber',
  'department',
  'size',
  'color',
  'location',
  'qty',
] as const

export type InventoryColumnId = (typeof INVENTORY_COLUMN_IDS)[number]

export type InventoryColumnVisibility = Record<InventoryColumnId, boolean>

export type InventoryUiState = {
  columns: InventoryColumnVisibility
  /** Optional per-column pixel widths (from user resize). */
  columnWidths: Partial<Record<InventoryColumnId, number>>
}

/** Defaults match Ricky’s call: no Dept column; Vendor Item Name on; Image already omitted. */
export const DEFAULT_INVENTORY_COLUMNS: InventoryColumnVisibility = {
  name: true,
  vendorItemName: true,
  itemNumber: true,
  department: false,
  size: true,
  color: true,
  location: true,
  qty: true,
}

const DEFAULTS: InventoryUiState = {
  columns: { ...DEFAULT_INVENTORY_COLUMNS },
  columnWidths: {},
}

export const INVENTORY_COLUMN_LABELS: Record<InventoryColumnId, string> = {
  name: 'Name',
  vendorItemName: 'Vendor item name',
  itemNumber: 'Item #',
  department: 'Department',
  size: 'Size',
  color: 'Color',
  location: 'Location',
  qty: 'Qty',
}

export async function loadInventoryUiState(): Promise<InventoryUiState> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.inventoryUiState)
  const raw = data[STORAGE_KEYS.inventoryUiState] as Partial<InventoryUiState> | undefined
  if (!raw) return { columns: { ...DEFAULT_INVENTORY_COLUMNS }, columnWidths: {} }
  return {
    columns: { ...DEFAULT_INVENTORY_COLUMNS, ...raw.columns },
    columnWidths: { ...raw.columnWidths },
  }
}

export async function saveInventoryUiState(patch: Partial<InventoryUiState>): Promise<void> {
  const current = await loadInventoryUiState()
  await chrome.storage.local.set({
    [STORAGE_KEYS.inventoryUiState]: {
      columns: patch.columns ? { ...current.columns, ...patch.columns } : current.columns,
      columnWidths: patch.columnWidths
        ? { ...current.columnWidths, ...patch.columnWidths }
        : current.columnWidths,
    },
  })
}
