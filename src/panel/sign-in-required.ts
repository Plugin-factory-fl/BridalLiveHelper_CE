export function renderSignInRequired(root: HTMLElement, action: string): void {
  const section = document.createElement('section')
  section.className = 'view'
  section.innerHTML = `
    <div class="auth-card">
      <div class="auth-card-head">
        <p class="auth-kicker">BridalLive Helper</p>
        <h2 class="auth-title">Sign in to ${escapeHtml(action)}</h2>
        <p class="auth-lead">Use your shop account on Home. Inventory and labels follow the boutique you pick there.</p>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-nav="home">Go to Home</button>
    </div>
  `
  root.appendChild(section)
  section.querySelector('[data-nav]')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('blh-navigate', { detail: 'home' }))
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}
