import { getPanelContext } from '../panel-context'
import type { ViewRender } from '../router'
import {
  HELPER_LOCATIONS,
  HELPER_SESSION_CHANGED,
  helperLogin,
  helperLogout,
  helperRegister,
  loadHelperSession,
  loadSignupConfig,
  setWorkingLocation,
  type HelperSession,
  type HelperSignupConfig,
} from '../../lib/helper-session'

type AuthMode = 'signin' | 'signup'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

function locationOptionsHtml(selectedId: string): string {
  return HELPER_LOCATIONS.map(
    (l) =>
      `<option value="${escapeHtml(l.id)}" ${l.id === selectedId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`,
  ).join('')
}

function locationName(id: string): string {
  return HELPER_LOCATIONS.find((l) => l.id === id)?.name ?? id
}

export const renderHome: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-home'
  section.innerHTML = `
    <div id="blh-home-account" class="home-account"></div>

    <div id="blh-home-work" class="home-work">
      <div id="blh-home-context" class="context-card">
        <p class="muted">Opening BridalLive…</p>
      </div>
      <h3 class="subheading">Quick actions</h3>
      <ul class="action-list">
        <li><button type="button" class="btn btn-secondary" data-nav="inventory">Look up a style, size, or color</button></li>
        <li><button type="button" class="btn btn-secondary" data-nav="labels">Print labels</button></li>
      </ul>
    </div>
  `

  root.appendChild(section)

  const accountEl = section.querySelector('#blh-home-account') as HTMLElement
  const workEl = section.querySelector('#blh-home-work') as HTMLElement
  let session: HelperSession | null = null
  let authMode: AuthMode = 'signin'
  let signupConfig: HelperSignupConfig = { enabled: true, codeRequired: false }
  let draft = {
    email: '',
    displayName: '',
    locationId: 'poughkeepsie',
  }

  const paintWorkVisibility = () => {
    workEl.hidden = !session
  }

  const paintAccount = () => {
    paintWorkVisibility()

    if (!session) {
      const isSignup = authMode === 'signup' && signupConfig.enabled
      const title = isSignup ? 'Create your account' : 'Welcome back'
      const lead = isSignup
        ? 'This is your Helper login for the shop — not your BridalLive password.'
        : 'Sign in to look up inventory and print labels for your boutique.'

      const signupFields = isSignup
        ? `
          <label class="auth-field">Name
            <input name="displayName" type="text" autocomplete="name" required maxlength="80" value="${escapeHtml(draft.displayName)}" placeholder="Jane" />
          </label>
        `
        : ''
      const codeField =
        isSignup && signupConfig.codeRequired
          ? `
          <label class="auth-field">Shop code
            <input name="signupCode" type="text" autocomplete="one-time-code" required placeholder="Ask a manager" />
          </label>
        `
          : ''
      const confirmField = isSignup
        ? `
          <label class="auth-field">Confirm password
            <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" />
          </label>
        `
        : ''
      const tabs = signupConfig.enabled
        ? `
          <div class="auth-tabs" role="tablist" aria-label="Account">
            <button type="button" class="auth-tab ${!isSignup ? 'is-active' : ''}" role="tab" aria-selected="${!isSignup}" data-auth-mode="signin">Sign in</button>
            <button type="button" class="auth-tab ${isSignup ? 'is-active' : ''}" role="tab" aria-selected="${isSignup}" data-auth-mode="signup">Create account</button>
          </div>
        `
        : ''

      accountEl.innerHTML = `
        <div class="auth-card">
          <div class="auth-card-head">
            <p class="auth-kicker">BridalLive Helper</p>
            <h2 class="auth-title">${title}</h2>
            <p class="auth-lead">${lead}</p>
          </div>
          ${tabs}
          <form id="blh-home-auth" class="auth-form" autocomplete="on">
            ${signupFields}
            <label class="auth-field">Email
              <input name="email" type="email" autocomplete="${isSignup ? 'email' : 'username'}" required value="${escapeHtml(draft.email)}" placeholder="you@chicboutique.com" />
            </label>
            <div class="auth-field">
              <label for="blh-auth-password">Password</label>
              <span class="auth-password">
                <input id="blh-auth-password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required ${isSignup ? 'minlength="8"' : ''} />
                <button type="button" class="auth-password-toggle" aria-pressed="false" aria-label="Show password">Show</button>
              </span>
            </div>
            ${confirmField}
            ${codeField}
            <label class="auth-field">Working location
              <select name="locationId">${locationOptionsHtml(draft.locationId)}</select>
            </label>
            <button type="submit" class="btn btn-primary btn-block auth-submit">${isSignup ? 'Create account' : 'Sign in'}</button>
            <p class="status auth-status" id="blh-home-auth-status" role="status"></p>
          </form>
        </div>
      `

      accountEl.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          authMode = btn.dataset.authMode === 'signup' ? 'signup' : 'signin'
          const form = accountEl.querySelector('#blh-home-auth') as HTMLFormElement | null
          if (form) {
            const fd = new FormData(form)
            draft.email = String(fd.get('email') ?? '')
            draft.displayName = String(fd.get('displayName') ?? draft.displayName)
            draft.locationId = String(fd.get('locationId') ?? draft.locationId)
          }
          paintAccount()
        })
      })

      const form = accountEl.querySelector('#blh-home-auth') as HTMLFormElement
      const passwordInput = form.querySelector<HTMLInputElement>('input[name="password"]')
      const toggle = form.querySelector<HTMLButtonElement>('.auth-password-toggle')
      toggle?.addEventListener('click', () => {
        if (!passwordInput) return
        const show = passwordInput.type === 'password'
        passwordInput.type = show ? 'text' : 'password'
        const confirm = form.querySelector<HTMLInputElement>('input[name="confirmPassword"]')
        if (confirm) confirm.type = passwordInput.type
        toggle.textContent = show ? 'Hide' : 'Show'
        toggle.setAttribute('aria-pressed', show ? 'true' : 'false')
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
      })

      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const status = form.querySelector('#blh-home-auth-status') as HTMLElement
        const fd = new FormData(form)
        const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement
        draft.email = String(fd.get('email') ?? '')
        draft.displayName = String(fd.get('displayName') ?? '')
        draft.locationId = String(fd.get('locationId') ?? draft.locationId)
        const password = String(fd.get('password') ?? '')
        submit.disabled = true
        status.textContent = isSignup ? 'Creating your account…' : 'Signing in…'
        status.className = 'status auth-status'
        try {
          if (isSignup) {
            const confirm = String(fd.get('confirmPassword') ?? '')
            if (password !== confirm) {
              throw new Error('Those passwords do not match.')
            }
            session = await helperRegister({
              email: draft.email,
              password,
              displayName: draft.displayName,
              locationId: draft.locationId,
              signupCode: String(fd.get('signupCode') ?? ''),
            })
          } else {
            session = await helperLogin(draft.email, password, draft.locationId)
          }
          paintAccount()
          paintContext()
        } catch (err) {
          status.textContent = err instanceof Error ? err.message : 'Could not complete that.'
          status.className = 'status auth-status error'
        } finally {
          submit.disabled = false
        }
      })
      return
    }

    const name = session.user.displayName
    accountEl.innerHTML = `
      <div class="auth-card auth-card--session">
        <div class="auth-session">
          <div class="auth-avatar" aria-hidden="true">${escapeHtml(initials(name))}</div>
          <div class="auth-session-copy">
            <p class="auth-session-name">${escapeHtml(name)}</p>
            <p class="auth-session-email">${escapeHtml(session.user.email)}</p>
          </div>
        </div>
        <label class="auth-field">Working location
          <select id="blh-home-location">${locationOptionsHtml(session.locationId)}</select>
        </label>
        <p class="auth-session-hint muted small">Inventory and labels use this boutique. Adding to a sale still uses the BridalLive tab you have open.</p>
        <button type="button" class="btn btn-ghost btn-block" id="blh-home-logout">Sign out</button>
        <p class="status auth-status" id="blh-home-location-status" role="status"></p>
      </div>
    `

    accountEl.querySelector('#blh-home-location')?.addEventListener('change', async (e) => {
      const locationId = (e.target as HTMLSelectElement).value
      const status = accountEl.querySelector('#blh-home-location-status') as HTMLElement
      try {
        session = await setWorkingLocation(locationId)
        status.textContent = `Using ${locationName(locationId)}.`
        status.className = 'status auth-status success'
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not switch location.'
        status.className = 'status auth-status error'
      }
    })

    accountEl.querySelector('#blh-home-logout')?.addEventListener('click', async () => {
      await helperLogout()
      session = null
      authMode = 'signin'
      paintAccount()
      paintContext()
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

  void (async () => {
    const [loaded, config] = await Promise.all([loadHelperSession(), loadSignupConfig()])
    session = loaded
    signupConfig = config
    if (!signupConfig.enabled) authMode = 'signin'
    paintAccount()
  })()
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
