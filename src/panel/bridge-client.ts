import { HOST_PATTERNS, isBridalLiveAppUrl, STORAGE_KEYS } from '../lib/config'
import { MSG, type ExtensionMessage, type ExtensionResponse } from '../lib/messages'

async function getPinnedBridalLiveTabId(): Promise<number | undefined> {
  const data = await chrome.storage.session.get(STORAGE_KEYS.helperBridalLiveTabId)
  const id = data[STORAGE_KEYS.helperBridalLiveTabId] as number | undefined
  if (typeof id !== 'number') return undefined
  try {
    const tab = await chrome.tabs.get(id)
    if (tab.id && tab.url && isBridalLiveAppUrl(tab.url)) return tab.id
  } catch {
    /* tab closed */
  }
  return undefined
}

export async function pinBridalLiveTab(tabId: number): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.helperBridalLiveTabId]: tabId })
}

async function getBridalLiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const pinnedId = await getPinnedBridalLiveTabId()
  if (pinnedId) {
    return chrome.tabs.get(pinnedId)
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (active?.url && isBridalLiveAppUrl(active.url)) {
    if (active.id) await pinBridalLiveTab(active.id)
    return active
  }

  const tabs = await chrome.tabs.query({ url: [...HOST_PATTERNS] })
  const tab = tabs[0]
  if (tab?.id) await pinBridalLiveTab(tab.id)
  return tab
}

export async function sendToContent<T extends ExtensionResponse>(
  message: ExtensionMessage,
): Promise<T> {
  const tab = await getBridalLiveTab()
  if (!tab?.id) {
    return {
      ok: false,
      error: 'Open app.bridallive.com and select that tab.',
    } as T
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, message)
    return (response ?? { ok: false, error: 'No response from BridalLive tab' }) as T
  } catch {
    return {
      ok: false,
      error: 'Could not reach BridalLive. Refresh the page and try again.',
    } as T
  }
}

export function onContextUpdate(handler: (message: ExtensionMessage) => void): () => void {
  const listener = (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r?: unknown) => void,
  ) => {
    if (message?.type === MSG.CONTEXT_UPDATE || message?.type === MSG.NAVIGATE_PANEL_VIEW) {
      handler(message)
    }
    sendResponse({ ok: true })
    return false
  }

  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}

export async function openSidePanel(): Promise<{ ok: boolean; error?: string }> {
  try {
    return (await chrome.runtime.sendMessage({
      action: 'open-side-panel',
    })) as { ok: boolean; error?: string }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to open side panel',
    }
  }
}

const PANEL_PORT_NAME = 'blh-panel'

/** Keeps a port open while the panel is visible so the background can toggle reliably. */
export function connectPanelLifecycle(): void {
  const port = chrome.runtime.connect({ name: PANEL_PORT_NAME })

  void getBridalLiveTab().then((tab) => {
    if (tab?.id) {
      void pinBridalLiveTab(tab.id)
      port.postMessage({ tabId: tab.id })
    }
  })
}
