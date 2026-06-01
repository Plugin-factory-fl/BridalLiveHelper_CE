import { isBridalLiveAppUrl } from '../lib/config'
import { log, warn } from '../lib/log'
import { MSG } from '../lib/messages'

const PANEL_PATH = 'src/panel/index.html'
const PANEL_PORT_NAME = 'blh-panel'
const SESSION_WANTS_OPEN = 'panelWantsOpenByTab'

type SidePanelWithClose = typeof chrome.sidePanel & {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void>
  onClosed?: chrome.events.Event<
    (details: { tabId?: number; windowId: number }) => void
  >
}

const sidePanelApi = chrome.sidePanel as SidePanelWithClose

/** Tabs whose side panel document is currently loaded (runtime port connected). */
const livePanelTabs = new Set<number>()

/** User wants panel open on this tab (survives auto-hide on tab switch). In-memory for sync toggle. */
const wantsOpenTabs = new Set<number>()

/** Skip clearing "wants open" when we close for tab-switch auto-hide. */
let autoHideSuppress = 0

async function loadWantsOpenFromSession(): Promise<void> {
  const data = await chrome.storage.session.get(SESSION_WANTS_OPEN)
  const arr = data[SESSION_WANTS_OPEN] as number[] | undefined
  wantsOpenTabs.clear()
  for (const id of arr ?? []) wantsOpenTabs.add(id)
}

function setWantsPanelOpenSync(tabId: number, wants: boolean): void {
  if (wants) wantsOpenTabs.add(tabId)
  else wantsOpenTabs.delete(tabId)
  void chrome.storage.session.set({ [SESSION_WANTS_OPEN]: [...wantsOpenTabs] })
}

function isPanelVisible(tabId: number): boolean {
  return livePanelTabs.has(tabId)
}

function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url ?? tab.pendingUrl ?? ''
}

function markPanelClosed(tabId: number): void {
  livePanelTabs.delete(tabId)
  void notifyLauncherState(tabId, false)
}

function markPanelOpen(tabId: number): void {
  livePanelTabs.add(tabId)
  void notifyLauncherState(tabId, true)
}

async function notifyLauncherState(
  tabId: number,
  open: boolean,
  wantsRestore = false,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'side-panel-state', open, wantsRestore })
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
      setWantsPanelOpenSync(tabId, true)
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
  void loadWantsOpenFromSession()
})

chrome.runtime.onStartup.addListener(() => {
  void setupSidePanel()
  void loadWantsOpenFromSession()
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
      if (autoHideSuppress === 0) {
        setWantsPanelOpenSync(tabId, false)
      }
    }
  })
}

async function ensureBlTabEnabled(tabId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled: true, path: PANEL_PATH })
}

async function disableSidePanelForTab(tabId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {})
}

/** Close with Chrome's slide animation; keeps "wants open" unless user closed manually. */
async function hidePanelForWindow(windowId: number): Promise<void> {
  if (!sidePanelApi.close) return
  autoHideSuppress++
  try {
    await sidePanelApi.close({ windowId })
    const tabs = await chrome.tabs.query({ windowId, url: ['https://app.bridallive.com/*'] })
    for (const tab of tabs) {
      if (tab.id) void notifyLauncherState(tab.id, false)
    }
  } catch (e) {
    warn('sidePanel auto-hide failed', e)
  } finally {
    autoHideSuppress--
  }
}

/** Panel was auto-hidden; Chrome requires a user gesture to open again (BL click). */
async function preparePanelRestore(tabId: number): Promise<void> {
  if (!wantsOpenTabs.has(tabId)) return
  await ensureBlTabEnabled(tabId)
  if (!isPanelVisible(tabId)) {
    void notifyLauncherState(tabId, false, true)
  }
}

async function handleTabActivated(tabId: number, windowId: number): Promise<void> {
  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return
  }

  const url = tabUrl(tab)
  if (isBridalLiveAppUrl(url)) {
    await ensureBlTabEnabled(tabId)
    await preparePanelRestore(tabId)
    return
  }

  await disableSidePanelForTab(tabId)

  const windowTabs = await chrome.tabs.query({ windowId })
  const anyBlTabWantsPanel = windowTabs.some(
    (t) => t.id !== undefined && wantsOpenTabs.has(t.id),
  )
  if (isPanelVisible(tabId) || livePanelTabs.size > 0 || anyBlTabWantsPanel) {
    await hidePanelForWindow(windowId)
  }
}

async function handleTabUrlChange(tabId: number, tab: chrome.tabs.Tab): Promise<void> {
  const url = tabUrl(tab)
  if (isBridalLiveAppUrl(url)) {
    await ensureBlTabEnabled(tabId)
    if (tab.active) {
      await preparePanelRestore(tabId)
    }
    return
  }

  if (wantsOpenTabs.has(tabId)) {
    await hidePanelForWindow(tab.windowId)
  }
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void handleTabActivated(tabId, windowId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) {
    void handleTabUrlChange(tabId, tab)
    return
  }

  if (!tab.url || !isBridalLiveAppUrl(tab.url)) return
  if (changeInfo.status !== 'complete') return

  void ensureBlTabEnabled(tabId).catch(() => {
    /* tab may have closed */
  })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle-side-panel' && sender.tab?.id) {
    const tabId = sender.tab.id
    // Must not await before open — user gesture expires. Visible state = port connected.
    if (isPanelVisible(tabId)) {
      void closeSidePanelForTab(tabId).then(sendResponse)
    } else {
      openSidePanelWithUserGesture(tabId, sendResponse)
    }
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
      setWantsPanelOpenSync(tabId, true)
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
    const open = isPanelVisible(tabId)
    const wantsRestore = wantsOpenTabs.has(tabId) && !open
    return { ok: true, open, wantsRestore }
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
    await ensureBlTabEnabled(id)
    await chrome.sidePanel.open({ tabId: id })
    setWantsPanelOpenSync(id, true)
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
  setWantsPanelOpenSync(tabId, false)
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
