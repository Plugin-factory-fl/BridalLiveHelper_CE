const COPIED_MS = 2000

export function itemNumberCellHtml(itemNumber: string, esc: (s: string) => string): string {
  return `
    <span class="item-num-row">
      <code>${esc(itemNumber)}</code>
      <button
        type="button"
        class="copy-icon-btn"
        data-copy-item="${esc(itemNumber)}"
        aria-label="Copy item number"
        title="Copy item number"
      >
        <svg class="copy-icon copy-icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg class="copy-icon copy-icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </span>`
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function wireCopyItemButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-copy-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copyItem
      if (!text || btn.classList.contains('copy-icon-btn--copied')) return

      void writeClipboard(text).then((ok) => {
        if (!ok) return
        btn.classList.add('copy-icon-btn--copied')
        btn.setAttribute('aria-label', 'Copied')
        btn.title = 'Copied'
        window.setTimeout(() => {
          btn.classList.remove('copy-icon-btn--copied')
          btn.setAttribute('aria-label', 'Copy item number')
          btn.title = 'Copy item number'
        }, COPIED_MS)
      })
    })
  })
}
