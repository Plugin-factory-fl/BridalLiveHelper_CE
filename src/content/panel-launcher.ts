import { isBridalLiveAppHost } from '../lib/config'
import { warn } from '../lib/log'

const BUTTON_ID = 'blh-open-panel'
const WIRED_ATTR = 'data-blh-wired'

/** Default offset from bottom-right when a BridalLive tab loads (not persisted). */
const LAUNCHER_BOTTOM_PX = 74
const LAUNCHER_RIGHT_PX = 74
const DRAG_THRESHOLD_PX = 6
const BTN_FALLBACK_SIZE_PX = 48

function applyDefaultPosition(btn: HTMLButtonElement): void {
  btn.style.removeProperty('left')
  btn.style.removeProperty('top')
  btn.style.setProperty('bottom', `${LAUNCHER_BOTTOM_PX}px`, 'important')
  btn.style.setProperty('right', `${LAUNCHER_RIGHT_PX}px`, 'important')
}

function clampToViewport(
  left: number,
  top: number,
  btn: HTMLButtonElement,
): { left: number; top: number } {
  const w = btn.offsetWidth || BTN_FALLBACK_SIZE_PX
  const h = btn.offsetHeight || BTN_FALLBACK_SIZE_PX
  return {
    left: Math.max(0, Math.min(left, window.innerWidth - w)),
    top: Math.max(0, Math.min(top, window.innerHeight - h)),
  }
}

function applyFreePosition(
  btn: HTMLButtonElement,
  left: number,
  top: number,
): void {
  btn.style.removeProperty('bottom')
  btn.style.removeProperty('right')
  const clamped = clampToViewport(left, top, btn)
  btn.style.setProperty('left', `${clamped.left}px`, 'important')
  btn.style.setProperty('top', `${clamped.top}px`, 'important')
}

function updateButtonState(btn: HTMLButtonElement, open: boolean, wantsRestore = false): void {
  btn.classList.toggle('blh-open-panel-btn--open', open)
  btn.classList.toggle('blh-open-panel-btn--restore', wantsRestore && !open)
  btn.setAttribute('aria-expanded', String(open))
  if (open) {
    btn.title = 'Close BridalLive Helper (drag to move)'
    btn.setAttribute('aria-label', 'Close BridalLive Helper side panel')
  } else if (wantsRestore) {
    btn.title = 'Restore BridalLive Helper (drag to move)'
    btn.setAttribute('aria-label', 'Restore BridalLive Helper side panel')
  } else {
    btn.title = 'Open BridalLive Helper (drag to move)'
    btn.setAttribute('aria-label', 'Open BridalLive Helper side panel')
  }
}

function toggleSidePanel(btn: HTMLButtonElement): void {
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
}

function wireLauncherInteractions(btn: HTMLButtonElement): void {
  let activePointer: number | null = null
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  let isDragging = false
  let didDrag = false

  const endPointer = (pointerId: number) => {
    if (activePointer !== pointerId) return
    if (btn.hasPointerCapture(pointerId)) {
      btn.releasePointerCapture(pointerId)
    }
    btn.classList.remove('blh-open-panel-btn--dragging')
    activePointer = null
    isDragging = false
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    activePointer = e.pointerId
    startX = e.clientX
    startY = e.clientY
    isDragging = false
    didDrag = false
    const rect = btn.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    btn.setPointerCapture(e.pointerId)
  })

  btn.addEventListener('pointermove', (e) => {
    if (activePointer !== e.pointerId) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (
      !isDragging &&
      (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)
    ) {
      isDragging = true
      didDrag = true
      btn.classList.add('blh-open-panel-btn--dragging')
      applyFreePosition(btn, originLeft, originTop)
    }
    if (isDragging) {
      e.preventDefault()
      applyFreePosition(btn, originLeft + dx, originTop + dy)
    }
  })

  btn.addEventListener('pointerup', (e) => {
    if (activePointer !== e.pointerId) return
    const wasDrag = didDrag
    endPointer(e.pointerId)
    if (!wasDrag) toggleSidePanel(btn)
  })

  btn.addEventListener('pointercancel', (e) => {
    endPointer(e.pointerId)
    didDrag = false
  })
}

function syncButtonState(btn: HTMLButtonElement): void {
  void chrome.runtime.sendMessage({ action: 'get-side-panel-state' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) return
    updateButtonState(btn, res.open === true, res.wantsRestore === true)
  })
}

function ensureButtonWired(btn: HTMLButtonElement): void {
  if (btn.getAttribute(WIRED_ATTR) === '1') return
  btn.setAttribute(WIRED_ATTR, '1')
  wireLauncherInteractions(btn)
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === 'side-panel-state') {
      updateButtonState(
        btn,
        message.open === true,
        message.wantsRestore === true,
      )
    }
  })
}

function initLauncher(): void {
  if (!isBridalLiveAppHost()) return

  const existing = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
  if (existing) {
    ensureButtonWired(existing)
    syncButtonState(existing)
    return
  }

  const btn = document.createElement('button')
  btn.id = BUTTON_ID
  btn.type = 'button'
  btn.className = 'blh-open-panel-btn'
  btn.textContent = 'BL'
  applyDefaultPosition(btn)
  updateButtonState(btn, false)
  ensureButtonWired(btn)
  document.body.appendChild(btn)
  syncButtonState(btn)
}

if (document.body) {
  initLauncher()
} else {
  document.addEventListener('DOMContentLoaded', initLauncher, { once: true })
}
