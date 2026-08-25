import { getPanelContext } from '../panel-context'
import type { ViewRender } from '../router'
import {
  HELPER_LOCATIONS,
  HELPER_SESSION_CHANGED,
  helperLogin,
  helperLogout,
  loadHelperSession,
  setWorkingLocation,
  type HelperSession,
} from '../../lib/helper-session'

export const renderHome: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-home'
  section.innerHTML = `
    <h2 class="view-title">Home</h2>

    <div id="blh-home-account" class="home-account"></div>

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

  const accountEl = section.querySelector('#blh-home-account') as HTMLElement
  let session: HelperSession | null = null

  const paintAccount = () => {
    if (!session) {
      accountEl.innerHTML = `
        <form id="blh-home-login" class="home-login fieldset" autocomplete="on">
          <p class="home-login-title">Sign in</p>
          <p class="muted small">Use your Chic Boutique Helper account. BridalLive keys stay on the server.</p>
          <label>Email
            <input name="email" type="email" autocomplete="username" required />
          </label>
          <label>Password
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit" class="btn btn-primary btn-block">Sign in</button>
          <p class="status" id="blh-home-login-status" role="status"></p>
        </form>
      `
      const form = accountEl.querySelector('#blh-home-login') as HTMLFormElement
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const status = form.querySelector('#blh-home-login-status') as HTMLElement
        const fd = new FormData(form)
        const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement
        submit.disabled = true
        status.textContent = 'Signing in…'
        status.className = 'status'
        try {
          session = await helperLogin(
            String(fd.get('email') ?? ''),
            String(fd.get('password') ?? ''),
          )
          paintAccount()
        } catch (err) {
          status.textContent = err instanceof Error ? err.message : 'Could not sign in.'
          status.className = 'status error'
        } finally {
          submit.disabled = false
        }
      })
      return
    }

    const locationOptions = HELPER_LOCATIONS.map(
      (l) =>
        `<option value="${escapeHtml(l.id)}" ${l.id === session!.locationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`,
    ).join('')

    accountEl.innerHTML = `
      <div class="home-signed-in fieldset">
        <p class="home-login-title">Signed in</p>
        <p class="home-signed-in-name">${escapeHtml(session.user.displayName)}</p>
        <p class="muted small">${escapeHtml(session.user.email)}</p>
        <label>Working location
          <select id="blh-home-location">${locationOptions}</select>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-home-logout">Sign out</button>
        <p class="status" id="blh-home-location-status" role="status"></p>
      </div>
    `

    accountEl.querySelector('#blh-home-location')?.addEventListener('change', async (e) => {
      const locationId = (e.target as HTMLSelectElement).value
      const status = accountEl.querySelector('#blh-home-location-status') as HTMLElement
      try {
        session = await setWorkingLocation(locationId)
        status.textContent = `Using ${HELPER_LOCATIONS.find((l) => l.id === locationId)?.name ?? locationId}.`
        status.className = 'status success'
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not switch location.'
        status.className = 'status error'
      }
    })

    accountEl.querySelector('#blh-home-logout')?.addEventListener('click', async () => {
      await helperLogout()
      session = null
      paintAccount()
    })
  }

  const paintContext = () => {
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

  void loadHelperSession().then((loaded) => {
    session = loaded
    paintAccount()
  })
  paintAccount()
  paintContext()

  const onUpdate = () => paintContext()
  const onSession = () => {
    void loadHelperSession().then((loaded) => {
      session = loaded
      paintAccount()
    })
  }
  document.addEventListener('blh-context-updated', onUpdate)
  document.addEventListener(HELPER_SESSION_CHANGED, onSession)

  section.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = (btn as HTMLElement).dataset.nav
      if (view) {
        document.dispatchEvent(new CustomEvent('blh-navigate', { detail: view }))
      }
    })
  })

  return () => {
    document.removeEventListener('blh-context-updated', onUpdate)
    document.removeEventListener(HELPER_SESSION_CHANGED, onSession)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
