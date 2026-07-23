import type { ActiveView } from '../lib/config'
import { MSG } from '../lib/messages'
import { applyFontSizePreference, loadPreferences } from '../lib/storage'
import { connectPanelLifecycle, onContextUpdate, sendToContent } from './bridge-client'
import { navigate, registerView } from './router'
import { initPanelContextFromStorage, setPanelContext } from './panel-context'
import { renderHome } from './views/home'
import { renderInventory } from './views/inventory'
import { renderLabels } from './views/labels'
import { renderSettings } from './views/settings'

const VIEW_ROOT_ID = 'blh-view-root'
let teardown: (() => void) | void

registerView('home', renderHome)
registerView('inventory', renderInventory)
registerView('labels', renderLabels)
registerView('settings', renderSettings)

function getViewRoot(): HTMLElement {
  const el = document.getElementById(VIEW_ROOT_ID)
  if (!el) throw new Error('View root missing')
  return el
}

function setActiveNav(view: ActiveView): void {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.view === view)
  })
}

function showView(view: ActiveView): void {
  if (typeof teardown === 'function') teardown()
  setActiveNav(view)
  teardown = navigate(getViewRoot(), view)
  void chrome.storage.local.set({ activeView: view })
}

function wireNav(): void {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = (btn as HTMLElement).dataset.view as ActiveView
      if (view) showView(view)
    })
  })

  document.addEventListener('blh-navigate', (e) => {
    const view = (e as CustomEvent<string>).detail as ActiveView
    if (view) showView(view)
  })
}

function wireContext(): void {
  onContextUpdate((message) => {
    if (message.type === MSG.CONTEXT_UPDATE) {
      setPanelContext(message.context)
    }
    if (message.type === MSG.NAVIGATE_PANEL_VIEW) {
      const view = message.view as ActiveView
      if (view) showView(view)
    }
  })
}

async function init(): Promise<void> {
  const prefs = await loadPreferences()
  applyFontSizePreference(prefs.fontSize)

  await initPanelContextFromStorage()
  connectPanelLifecycle()
  wireNav()
  wireContext()

  const initial = prefs.activeView ?? 'home'
  showView(initial)

  const ctxRes = await sendToContent({ type: MSG.GET_CONTEXT })
  if (ctxRes.ok && ctxRes.context) {
    setPanelContext(ctxRes.context)
  }

  await sendToContent({ type: MSG.PANEL_READY })
}

void init()
