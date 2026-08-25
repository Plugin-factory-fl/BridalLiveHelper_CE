import { STORAGE_KEYS } from './config'
import { AUTO_STYLE_LAYOUT_ID } from '../labels/style-layouts'

export const LABELS_SUB_TABS = ['receiving', 'mass', 'reprint'] as const
export type LabelsSubTab = (typeof LABELS_SUB_TABS)[number]

export type LabelsUiState = {
  startRow: number
  startCol: number
  /** itemNumber → checked (only stored when explicitly false). */
  receivingSelected: Record<string, boolean>
  labelStyleLayoutId: string
  reprintItemNumber: string
  reprintQuantity: number
  receivingLocationId: string
  receivingVoucherId: number | null
  statusText: string
  statusKind: '' | 'success' | 'error'
  /** Scroll position of `.panel-main` while on Labels view. */
  scrollTop: number
  activeSubTab: LabelsSubTab
}

const DEFAULTS: LabelsUiState = {
  startRow: 1,
  startCol: 1,
  receivingSelected: {},
  labelStyleLayoutId: AUTO_STYLE_LAYOUT_ID,
  reprintItemNumber: '',
  reprintQuantity: 1,
  receivingLocationId: '',
  receivingVoucherId: null,
  statusText: '',
  statusKind: '',
  scrollTop: 0,
  activeSubTab: 'receiving',
}

export async function loadLabelsUiState(): Promise<LabelsUiState> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.labelsUiState)
  const raw = data[STORAGE_KEYS.labelsUiState] as Partial<LabelsUiState> & {
    reprintVendorItemName?: string
  } | undefined
  if (!raw) return { ...DEFAULTS }
  const activeSubTab = LABELS_SUB_TABS.includes(raw.activeSubTab as LabelsSubTab)
    ? (raw.activeSubTab as LabelsSubTab)
    : DEFAULTS.activeSubTab
  return {
    ...DEFAULTS,
    ...raw,
    receivingSelected: raw.receivingSelected ?? {},
    reprintItemNumber: raw.reprintItemNumber || raw.reprintVendorItemName || '',
    activeSubTab,
  }
}

export async function saveLabelsUiState(patch: Partial<LabelsUiState>): Promise<void> {
  const current = await loadLabelsUiState()
  await chrome.storage.local.set({
    [STORAGE_KEYS.labelsUiState]: { ...current, ...patch },
  })
}
