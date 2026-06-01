import { isBridalLiveAppHost } from '../lib/config'
import { warn } from '../lib/log'

const BUTTON_ID = 'blh-open-panel'

function updateButtonState(btn: HTMLButtonElement, open: boolean, wantsRestore = false): void {
  btn.classList.toggle('blh-open-panel-btn--open', open)
  btn.classList.toggle('blh-open-panel-btn--restore', wantsRestore && !open)
  btn.setAttribute('aria-expanded', String(open))
  if (open) {
    btn.title = 'Close BridalLive Helper'
    btn.setAttribute('aria-label', 'Close BridalLive Helper side panel')
  } else if (wantsRestore) {
    btn.title = 'Click to restore BridalLive Helper side panel'
    btn.setAttribute('aria-label', 'Restore BridalLive Helper side panel')
  } else {
    btn.title = 'Open BridalLive Helper'
    btn.setAttribute('aria-label', 'Open BridalLive Helper side panel')
  }
}

function syncButtonState(btn: HTMLButtonElement): void {
  void chrome.runtime.sendMessage({ action: 'get-side-panel-state' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) return
    updateButtonState(btn, res.open === true, res.wantsRestore === true)
  })
}

function initLauncher(): void {
  if (!isBridalLiveAppHost() || document.getElementById(BUTTON_ID)) return

  const btn = document.createElement('button')
  btn.id = BUTTON_ID
  btn.type = 'button'
  btn.className = 'blh-open-panel-btn'
  btn.textContent = 'BL'
  updateButtonState(btn, false)

  btn.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ action: 'toggle-side-panel' }, (res) => {
      if (chrome.runtime.lastError) {
        warn('toggle-side-panel:', chrome.runtime.lastError.message)
        return
      }
      if (!res?.ok) {
        warn('toggle-side-panel:', res?.error ?? 'unknown error')
        return
      }
      if (typeof res.open === 'boolean') {
        updateButtonState(btn, res.open, res.wantsRestore === true)
      }
    })
  })

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === 'side-panel-state') {
      updateButtonState(
        btn,
        message.open === true,
        message.wantsRestore === true,
      )
    }
  })

  document.body.appendChild(btn)
  syncButtonState(btn)
}

if (document.body) {
  initLauncher()
} else {
  document.addEventListener('DOMContentLoaded', initLauncher, { once: true })
}
