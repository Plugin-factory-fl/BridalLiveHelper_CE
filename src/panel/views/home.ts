import { getPanelContext } from '../panel-context'
import type { ViewRender } from '../router'

export const renderHome: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-home'
  section.innerHTML = `
    <h2 class="view-title">Current screen</h2>
    <div id="blh-home-context" class="context-card">
      <p class="muted">Loading context…</p>
    </div>
    <p class="muted small mvp-note">MVP demo: mock catalog only. Phase 2 = BridalLive API swap (no UI rewrite).</p>
    <h3 class="subheading">Quick actions</h3>
    <ul class="action-list">
      <li><button type="button" class="btn btn-secondary" data-nav="inventory">Look up style / size / color</button></li>
      <li><button type="button" class="btn btn-secondary" data-nav="labels">Print labels</button></li>
    </ul>
  `

  root.appendChild(section)

  const paint = () => {
    const el = section.querySelector('#blh-home-context')
    const context = getPanelContext()
    if (!el || !context) return
    el.innerHTML = `
      <p class="context-screen">${escapeHtml(context.screenLabel)}</p>
      <p class="context-url">${escapeHtml(context.url)}</p>
      <ul class="hint-list">
        ${context.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
      </ul>
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
