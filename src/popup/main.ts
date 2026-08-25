import { MSG } from '../lib/messages'

const statusEl = document.getElementById('status') as HTMLElement
const openBtn = document.getElementById('open-panel') as HTMLButtonElement
const settingsBtn = document.getElementById('open-settings') as HTMLButtonElement

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text
  statusEl.className = isError ? 'status error' : 'status'
}

openBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ action: 'open-side-panel' })
  if (!res?.ok) {
    setStatus(res?.error ?? 'Could not open the Helper.', true)
    return
  }
  setStatus('Helper opened.')
  window.close()
})

settingsBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'open-side-panel' })
  await chrome.runtime.sendMessage({ type: MSG.NAVIGATE_PANEL_VIEW, view: 'settings' })
  window.close()
})

setStatus('Click Open Helper, or the Helper icon in the toolbar.')
