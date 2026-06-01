import { isBridalLiveAppUrl } from '../lib/config'
import { log, warn } from '../lib/log'
import { MSG } from '../lib/messages'

const PANEL_PATH = 'src/panel/index.html'
const PANEL_PORT_NAME = 'blh-panel'

type SidePanelWithClose = typeof chrome.sidePanel & {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void>
  onClosed?: chrome.events.Event<
    (details: { tabId?: number; windowId: number }) => void
  >
}

const sidePanelApi = chrome.sidePanel as SidePanelWithClose

/** Tabs whose side panel document is currently loaded (runtime port connected). */
const livePanelTabs = new Set<number>()

function markPanelClosed(tabId: number): void {
  livePanelTabs.delete(tabId)
  void notifyLauncherState(tabId, false)
}

function markPanelOpen(tabId: number): void {
  livePanelTabs.add(tabId)
  void notifyLauncherState(tabId, true)
}

async function notifyLauncherState(tabId: number, open: boolean): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'side-panel-state', open })
  } catch {
    /* content script may not be injected */
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return

  let tabId: number | undefined

  const onMessage = (msg: { tabId?: number }) => {
    if (typeof msg.tabId === 'number') {
      tabId = msg.tabId
      markPanelOpen(tabId)
    }
  }

  port.onMessage.addListener(onMessage)
  port.onDisconnect.addListener(() => {
    port.onMessage.removeListener(onMessage)
    if (tabId !== undefined) {
      markPanelClosed(tabId)
    }
  })
})

chrome.runtime.onInstalled.addListener(() => {
  void setupSidePanel()
})

chrome.runtime.onStartup.addListener(() => {
  void setupSidePanel()
})

async function setupSidePanel(): Promise<void> {
  try {
    await chrome.sidePanel.setOptions({ enabled: true, path: PANEL_PATH })
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    log('Chrome side panel enabled')
  } catch (e) {
    warn('sidePanel setup failed', e)
  }
}

if (sidePanelApi.onClosed) {
  sidePanelApi.onClosed.addListener(({ tabId }) => {
    if (tabId !== undefined) {
      markPanelClosed(tabId)
    }
  })
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url || !isBridalLiveAppUrl(tab.url)) return
  if (changeInfo.status !== 'complete' && changeInfo.url === undefined) return

  void chrome.sidePanel
    .setOptions({
      tabId,
      enabled: true,
      path: PANEL_PATH,
    })
    .catch(() => {
      /* tab may have closed */
    })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle-side-panel' && sender.tab?.id) {
    const tabId = sender.tab.id
    if (livePanelTabs.has(tabId)) {
      void closeSidePanelForTab(tabId).then(sendResponse)
      return true
    }
    openSidePanelWithUserGesture(tabId, sendResponse)
    return true
  }

  void handleMessage(message, sender).then(sendResponse)
  return true
})

function openSidePanelWithUserGesture(
  tabId: number,
  sendResponse: (response: { ok: boolean; open?: boolean; error?: string }) => void,
): void {
  void chrome.sidePanel.setOptions({ tabId, enabled: true, path: PANEL_PATH }, () => {
    const optionsError = chrome.runtime.lastError
    if (optionsError) {
      warn('sidePanel.setOptions failed', optionsError.message)
      sendResponse({ ok: false, error: optionsError.message })
      return
    }

    void chrome.sidePanel.open({ tabId }, () => {
      const openError = chrome.runtime.lastError
      if (openError) {
        warn('sidePanel.open failed', openError.message)
        sendResponse({ ok: false, error: openError.message })
        return
      }
      sendResponse({ ok: true, open: true })
    })
  })
}

async function handleMessage(
  message: { type?: string; action?: string; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (message.action === 'get-side-panel-state') {
    const tabId = (message.tabId as number | undefined) ?? sender.tab?.id
    if (!tabId) return { ok: false, open: false }
    return { ok: true, open: livePanelTabs.has(tabId) }
  }

  if (message.action === 'open-side-panel' || message.type === MSG.OPEN_SIDE_PANEL) {
    return openSidePanelForTab(sender.tab?.id)
  }

  if (message.type === MSG.NAVIGATE_PANEL_VIEW) {
    void chrome.runtime.sendMessage(message).catch(() => {})
    return { ok: true }
  }

  if (sender.tab?.id && isBridalLiveAppUrl(sender.tab.url ?? '')) {
    return forwardToTab(sender.tab.id, message)
  }

  const tab = await findBridalLiveTab()
  if (tab?.id) {
    return forwardToTab(tab.id, message)
  }

  return { ok: false, error: 'Open app.bridallive.com in a tab first.' }
}

async function resolveTabId(tabId?: number): Promise<number | undefined> {
  if (tabId) return tabId
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  return active?.id
}

async function openSidePanelForTab(
  tabId?: number,
): Promise<{ ok: boolean; open?: boolean; error?: string }> {
  const id = tabId ?? (await resolveTabId())
  if (!id) {
    return { ok: false, error: 'No active tab.' }
  }

  try {
    await chrome.sidePanel.setOptions({ tabId: id, enabled: true, path: PANEL_PATH })
    await chrome.sidePanel.open({ tabId: id })
    return { ok: true, open: true }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    warn('sidePanel.open failed', errMsg)
    return {
      ok: false,
      error:
        errMsg ||
        'Click the BridalLive Helper icon in the toolbar to open the panel.',
    }
  }
}

async function closeSidePanelForTab(
  tabId: number,
): Promise<{ ok: boolean; open?: boolean; error?: string }> {
  try {
    if (sidePanelApi.close) {
      await sidePanelApi.close({ tabId })
    } else {
      await chrome.sidePanel.setOptions({ tabId, enabled: false })
    }
    markPanelClosed(tabId)
    return { ok: true, open: false }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Could not close side panel.'
    warn('sidePanel.close failed', errMsg)
    return { ok: false, error: errMsg }
  }
}

async function forwardToTab(tabId: number, message: unknown) {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not reach BridalLive tab',
    }
  }
}

async function findBridalLiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (active?.url && isBridalLiveAppUrl(active.url)) return active

  const tabs = await chrome.tabs.query({ url: ['https://app.bridallive.com/*'] })
  return tabs[0]
}
