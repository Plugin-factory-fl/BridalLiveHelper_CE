import { isBridalLiveAppUrl, isHelperPrintPreviewUrl, STORAGE_KEYS, type PrintPreviewSession } from '../lib/config'
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

async function loadPrintPreviewSession(): Promise<PrintPreviewSession | null> {
  const data = await chrome.storage.session.get(STORAGE_KEYS.helperPrintPreview)
  const session = data[STORAGE_KEYS.helperPrintPreview] as PrintPreviewSession | undefined
  if (!session || typeof session.windowId !== 'number' || typeof session.blTabId !== 'number') {
    return null
  }
  return session
}

async function savePrintPreviewSession(session: PrintPreviewSession | null): Promise<void> {
  if (session) {
    await chrome.storage.session.set({ [STORAGE_KEYS.helperPrintPreview]: session })
  } else {
    await chrome.storage.session.remove(STORAGE_KEYS.helperPrintPreview)
  }
}

async function isPrintPreviewWindow(windowId: number): Promise<boolean> {
  const session = await loadPrintPreviewSession()
  return session?.windowId === windowId
}

async function resolvePrintPreviewBlTab(): Promise<{ blTabId: number; windowId: number } | null> {
  const pinned = await chrome.storage.session.get(STORAGE_KEYS.helperBridalLiveTabId)
  const pinnedId = pinned[STORAGE_KEYS.helperBridalLiveTabId] as number | undefined
  if (typeof pinnedId === 'number') {
    try {
      const tab = await chrome.tabs.get(pinnedId)
      if (tab.id && tab.windowId !== undefined && isBridalLiveAppUrl(tabUrl(tab))) {
        return { blTabId: tab.id, windowId: tab.windowId }
      }
    } catch {
      /* tab gone */
    }
  }

  for (const tabId of wantsOpenTabs) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.id && tab.windowId !== undefined && isBridalLiveAppUrl(tabUrl(tab))) {
        return { blTabId: tab.id, windowId: tab.windowId }
      }
    } catch {
      wantsOpenTabs.delete(tabId)
    }
  }

  return null
}

/** Keep the same side panel document visible while the user prints from a PDF tab. */
async function maintainPanelDuringPrintPreview(
  activeTabId: number,
  windowId: number,
): Promise<void> {
  const session = await loadPrintPreviewSession()
  if (!session || session.windowId !== windowId) return

  await ensurePanelEnabledForTab(activeTabId)

  if (livePanelTabs.size > 0) return

  if (!wantsOpenTabs.has(session.blTabId)) return

  try {
    await chrome.sidePanel.open({ windowId })
  } catch (e) {
    warn('sidePanel reopen during print preview failed', e)
  }
}

async function waitForTabComplete(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  if (tab.status === 'complete') return

  await new Promise<void>((resolve) => {
    const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
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
  sidePanelApi.onClosed.addListener(({ tabId, windowId }) => {
    if (tabId !== undefined) {
      markPanelClosed(tabId)
      if (autoHideSuppress === 0) {
        void (async () => {
          if (await isPrintPreviewWindow(windowId)) return
          setWantsPanelOpenSync(tabId, false)
        })()
      }
    }
  })
}

async function ensureBlTabEnabled(tabId: number): Promise<void> {
  await ensurePanelEnabledForTab(tabId)
}

async function ensurePanelEnabledForTab(tabId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled: true, path: PANEL_PATH })
}

async function disableSidePanelForTab(tabId: number): Promise<void> {
  await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {})
}

/** Close with Chrome's slide animation; keeps "wants open" unless user closed manually. */
async function hidePanelForWindow(windowId: number): Promise<void> {
  if (await isPrintPreviewWindow(windowId)) return
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
  if (await isPrintPreviewWindow(windowId)) {
    await maintainPanelDuringPrintPreview(tabId, windowId)
    return
  }

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

  if (isHelperPrintPreviewUrl(url)) {
    await maintainPanelDuringPrintPreview(tabId, windowId)
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
  if (tab.windowId !== undefined && (await isPrintPreviewWindow(tab.windowId))) {
    if (tab.active) {
      await maintainPanelDuringPrintPreview(tabId, tab.windowId)
    }
    return
  }

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

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const session = await loadPrintPreviewSession()
    if (session?.pdfTabId === tabId) {
      await savePrintPreviewSession(null)
      await chrome.storage.session.remove(STORAGE_KEYS.helperPrintPdfBytes)
    }
  })()
})

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
  if (message.action === 'labels-print-preview-begin') {
    const fromMessage =
      typeof message.blTabId === 'number' && typeof message.windowId === 'number'
        ? { blTabId: message.blTabId as number, windowId: message.windowId as number }
        : null
    const ctx = fromMessage ?? (await resolvePrintPreviewBlTab())
    if (!ctx) {
      return { ok: false, error: 'Open BridalLive with the Helper first.' }
    }
    await savePrintPreviewSession({
      windowId: ctx.windowId,
      blTabId: ctx.blTabId,
    })
    return { ok: true }
  }

  if (message.action === 'labels-print-preview-opened' && typeof message.pdfTabId === 'number') {
    const session = await loadPrintPreviewSession()
    const pdfTabId = message.pdfTabId as number
    if (!session) {
      return { ok: false, error: 'Print preview session expired.' }
    }

    autoHideSuppress++
    try {
      await savePrintPreviewSession({ ...session, pdfTabId })
      await waitForTabComplete(pdfTabId)
      await ensurePanelEnabledForTab(pdfTabId)
      await chrome.tabs.update(pdfTabId, { active: true })

      if (livePanelTabs.size === 0 && wantsOpenTabs.has(session.blTabId)) {
        try {
          await chrome.sidePanel.open({ windowId: session.windowId })
        } catch (e) {
          warn('sidePanel open for print preview failed', e)
        }
      }
    } finally {
      autoHideSuppress--
    }

    return { ok: true }
  }

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

  return { ok: false, error: 'Open BridalLive in a tab first.' }
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
        'Click the BridalLive Helper icon in the toolbar to open it.',
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
