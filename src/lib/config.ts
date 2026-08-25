/** Default side panel width in pixels (stored preference; Chrome controls actual panel width). */
export const PANEL_DEFAULT_WIDTH = 420
export const PANEL_MIN_WIDTH = 320
export const PANEL_MAX_WIDTH = 640

export const HOST_PATTERNS = [
  'https://app.bridallive.com/*',
  'https://*.bridallive.com/*',
] as const

export const BRIDALLIVE_ORIGINS = [
  'https://app.bridallive.com',
] as const

/** Marketing / public site — no content scripts or side panel. */
export const BRIDALLIVE_MARKETING_HOSTS = new Set([
  'www.bridallive.com',
  'bridallive.com',
])

/** True when the logged-in BridalLive app (not marketing www). */
export function isBridalLiveAppHost(hostname = location.hostname): boolean {
  const host = hostname.toLowerCase()
  if (host === 'app.bridallive.com') return true
  if (BRIDALLIVE_MARKETING_HOSTS.has(host)) return false
  return host.endsWith('.bridallive.com')
}

export function isBridalLiveAppUrl(url: string): boolean {
  try {
    return isBridalLiveAppHost(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Label PDF tab (native Chrome viewer on blob: URL, or legacy extension redirect page). */
export function isHelperPrintPreviewUrl(url: string): boolean {
  if (url.startsWith('blob:') && url.includes('zoom=100')) return true
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'chrome-extension:' &&
      parsed.pathname.endsWith('/pdf-viewer/index.html')
    )
  } catch {
    return false
  }
}

/** Future Render API base; empty in foundation uses mock client. */
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** Chrome PDF viewer open parameter — 100% scale, not fit-to-page. */
export const PDF_VIEWER_ZOOM = '#zoom=100'

export type FontSizePreference = 'small' | 'medium' | 'large'

export const FONT_SIZE_OPTIONS: readonly FontSizePreference[] = [
  'small',
  'medium',
  'large',
] as const

export const STORAGE_KEYS = {
  panelOpen: 'panelOpen',
  panelWidth: 'panelWidth',
  activeView: 'activeView',
  mockStoreId: 'mockStoreId',
  devScreenOverride: 'devScreenOverride',
  fontSize: 'fontSize',
  labelsUiState: 'labelsUiState',
  inventoryUiState: 'inventoryUiState',
  lastBridalLiveContext: 'lastBridalLiveContext',
  helperBridalLiveTabId: 'helperBridalLiveTabId',
  /** Active while a label PDF tab is open — side panel must stay up in that window. */
  helperPrintPreview: 'helperPrintPreview',
  /** Uint8 array stored while the print-preview tab is open. */
  helperPrintPdfBytes: 'helperPrintPdfBytes',
  /** Phase 2: per-location Retailer ID + API key (chrome.storage.local). */
  bridalLiveApiSettings: 'bridalLiveApiSettings',
  /** Phase 3: Helper employee session (token + working location). */
  helperSession: 'helperSession',
} as const

export type PrintPreviewSession = {
  windowId: number
  blTabId: number
  pdfTabId?: number
}

export type ActiveView = 'home' | 'inventory' | 'labels' | 'settings'

export const DEPARTMENTS = ['Dress', 'Shoes', 'Jewelry'] as const
export type Department = (typeof DEPARTMENTS)[number]
