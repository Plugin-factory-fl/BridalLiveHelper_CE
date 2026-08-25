import {
  FONT_SIZE_OPTIONS,
  PANEL_DEFAULT_WIDTH,
  STORAGE_KEYS,
  type ActiveView,
  type FontSizePreference,
} from './config'

export type StoredPreferences = {
  panelOpen: boolean
  panelWidth: number
  activeView: ActiveView
  mockStoreId: string
  fontSize: FontSizePreference
}

const DEFAULTS: StoredPreferences = {
  panelOpen: true,
  panelWidth: PANEL_DEFAULT_WIDTH,
  activeView: 'home',
  mockStoreId: 'store-1',
  fontSize: 'small',
}

function parseFontSize(value: unknown): FontSizePreference {
  return FONT_SIZE_OPTIONS.includes(value as FontSizePreference)
    ? (value as FontSizePreference)
    : DEFAULTS.fontSize
}

export function applyFontSizePreference(fontSize: FontSizePreference): void {
  document.documentElement.dataset.fontSize = fontSize
}

export async function loadPreferences(): Promise<StoredPreferences> {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS))
  return {
    panelOpen: data[STORAGE_KEYS.panelOpen] ?? DEFAULTS.panelOpen,
    panelWidth: Number(data[STORAGE_KEYS.panelWidth]) || DEFAULTS.panelWidth,
    activeView: (data[STORAGE_KEYS.activeView] as ActiveView) ?? DEFAULTS.activeView,
    mockStoreId: String(data[STORAGE_KEYS.mockStoreId] ?? DEFAULTS.mockStoreId),
    fontSize: parseFontSize(data[STORAGE_KEYS.fontSize]),
  }
}

export async function savePreferences(
  patch: Partial<StoredPreferences>,
): Promise<StoredPreferences> {
  const next: Record<string, unknown> = {}
  if (patch.panelOpen !== undefined) next[STORAGE_KEYS.panelOpen] = patch.panelOpen
  if (patch.panelWidth !== undefined) next[STORAGE_KEYS.panelWidth] = patch.panelWidth
  if (patch.activeView !== undefined) next[STORAGE_KEYS.activeView] = patch.activeView
  if (patch.mockStoreId !== undefined) next[STORAGE_KEYS.mockStoreId] = patch.mockStoreId
  if (patch.fontSize !== undefined) {
    next[STORAGE_KEYS.fontSize] = parseFontSize(patch.fontSize)
  }
  await chrome.storage.local.set(next)
  return loadPreferences()
}
