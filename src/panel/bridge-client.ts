import { isBridalLiveAppUrl } from '../lib/config'
import { MSG, type ExtensionMessage, type ExtensionResponse } from '../lib/messages'

async function getBridalLiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (active?.url && isBridalLiveAppUrl(active.url)) return active

  const tabs = await chrome.tabs.query({ url: ['https://app.bridallive.com/*'] })
  return tabs[0]
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
      port.postMessage({ tabId: tab.id })
    }
  })
}
