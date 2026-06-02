import { STORAGE_KEYS } from './config'

export type LabelsUiState = {
  startRow: number
  startCol: number
  /** itemNumber → checked (only stored when explicitly false). */
  receivingSelected: Record<string, boolean>
  reprintDepartment: string
  reprintItemNumber: string
  reprintQuantity: number
  statusText: string
  statusKind: '' | 'success' | 'error'
  /** Scroll position of `.panel-main` while on Labels view. */
  scrollTop: number
}

const DEFAULTS: LabelsUiState = {
  startRow: 1,
  startCol: 1,
  receivingSelected: {},
  reprintDepartment: 'Dress',
  reprintItemNumber: '',
  reprintQuantity: 1,
  statusText: '',
  statusKind: '',
  scrollTop: 0,
}

export async function loadLabelsUiState(): Promise<LabelsUiState> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.labelsUiState)
  const raw = data[STORAGE_KEYS.labelsUiState] as Partial<LabelsUiState> | undefined
  if (!raw) return { ...DEFAULTS }
  return {
    ...DEFAULTS,
    ...raw,
    receivingSelected: raw.receivingSelected ?? {},
  }
}

export async function saveLabelsUiState(patch: Partial<LabelsUiState>): Promise<void> {
  const current = await loadLabelsUiState()
  await chrome.storage.local.set({
    [STORAGE_KEYS.labelsUiState]: { ...current, ...patch },
  })
}
