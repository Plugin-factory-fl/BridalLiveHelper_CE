export type ModalOptions = {
  title: string
  body: string
  variant?: 'warn' | 'info'
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary?: () => void
  onSecondary?: () => void
}

/** Modal overlay scoped to the side panel. Returns close function. */
export function showModal(host: HTMLElement, options: ModalOptions): () => void {
  const existing = host.querySelector('.blh-modal-host')
  existing?.remove()

  const variant = options.variant ?? 'warn'
  const overlay = document.createElement('div')
  overlay.className = 'blh-modal-host'
  overlay.innerHTML = `
    <div class="blh-modal-backdrop" data-close></div>
    <div class="blh-modal blh-modal--${variant}" role="alertdialog" aria-modal="true" aria-labelledby="blh-modal-title">
      <div class="blh-modal-icon" aria-hidden="true">${variant === 'warn' ? '⚠' : 'ℹ'}</div>
      <h3 id="blh-modal-title" class="blh-modal-title">${escapeHtml(options.title)}</h3>
      <p class="blh-modal-body">${escapeHtml(options.body)}</p>
      <div class="blh-modal-actions">
        ${
          options.secondaryLabel
            ? `<button type="button" class="btn btn-secondary blh-modal-secondary">${escapeHtml(options.secondaryLabel)}</button>`
            : ''
        }
        <button type="button" class="btn btn-primary blh-modal-primary">${escapeHtml(options.primaryLabel ?? 'OK')}</button>
      </div>
    </div>
  `

  host.appendChild(overlay)

  const close = () => overlay.remove()

  overlay.querySelector('[data-close]')?.addEventListener('click', close)
  overlay.querySelector('.blh-modal-primary')?.addEventListener('click', () => {
    options.onPrimary?.()
    close()
  })
  overlay.querySelector('.blh-modal-secondary')?.addEventListener('click', () => {
    options.onSecondary?.()
    close()
  })

  return close
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}
