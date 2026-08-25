import { getPanelContext } from '../panel-context'
import type { ViewRender } from '../router'

export const renderHome: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-home'
  section.innerHTML = `
    <h2 class="view-title">Home</h2>
    <div id="blh-home-context" class="context-card">
      <p class="muted">Opening BridalLive…</p>
    </div>
    <h3 class="subheading">Quick actions</h3>
    <ul class="action-list">
      <li><button type="button" class="btn btn-secondary" data-nav="inventory">Look up a style, size, or color</button></li>
      <li><button type="button" class="btn btn-secondary" data-nav="labels">Print labels</button></li>
    </ul>
  `

  root.appendChild(section)

  const paint = () => {
    const el = section.querySelector('#blh-home-context') as HTMLElement | null
    const context = getPanelContext()
    if (!el) return
    if (!context) {
      el.hidden = false
      el.innerHTML = `<p class="muted">Open a BridalLive tab to see which screen you are on.</p>`
      return
    }

    const hints = context.hints.filter(
      (h) => !/look up an item number here/i.test(h) && !/reprint its label/i.test(h),
    )
    const isInventoryScreen =
      context.screen === 'inventory' || context.screenLabel.trim().toLowerCase() === 'inventory'

    if (isInventoryScreen) {
      el.hidden = true
      el.innerHTML = ''
      return
    }

    el.hidden = false
    const hintList = hints.length
      ? `<ul class="hint-list">${hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
      : ''
    el.innerHTML = `
      <p class="context-screen">${escapeHtml(context.screenLabel)}</p>
      ${hintList}
    `
  }

  paint()
  const onUpdate = () => paint()
  document.addEventListener('blh-context-updated', onUpdate)

  section.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = (btn as HTMLElement).dataset.nav
      if (view) {
        document.dispatchEvent(new CustomEvent('blh-navigate', { detail: view }))
      }
    })
  })

  return () => document.removeEventListener('blh-context-updated', onUpdate)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
