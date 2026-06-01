import { MSG } from '../../lib/messages'
import { getDataSourceLabel } from '../../lib/data-source'
import { listStores } from '../../api/client'
import { loadPreferences } from '../../lib/storage'
import { sendToContent } from '../bridge-client'
import type { ViewRender } from '../router'

export const renderSettings: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-settings'
  section.innerHTML = `
    <h2 class="view-title">Settings</h2>
    <p class="data-source-badge" id="blh-data-source"></p>
    <p class="muted small">MVP uses mock data end-to-end. Phase 2 swaps the provider layer for BridalLive API — no panel redesign.</p>
    <form id="blh-settings-form" class="form-stack">
      <label>Mock store
        <select name="mockStoreId" id="blh-store-select"></select>
      </label>
      <label>Dev screen override
        <select name="devScreenOverride" id="blh-dev-screen">
          <option value="">Auto (URL)</option>
          <option value="order">Order</option>
          <option value="receiving">Receiving</option>
          <option value="inventory">Inventory</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <fieldset class="fieldset">
        <legend>BridalLive API (Phase 2)</legend>
        <p class="muted small">Retailer ID and API key will be stored here after Elite API approval.</p>
        <button type="button" class="btn btn-ghost" disabled>Connect BridalLive API</button>
      </fieldset>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
    <p id="blh-settings-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const badge = section.querySelector('#blh-data-source') as HTMLElement
  badge.textContent = `Data source: ${getDataSourceLabel()}`

  void listStores().then((stores) => {
    const select = section.querySelector('#blh-store-select') as HTMLSelectElement
    select.innerHTML = stores
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join('')
    void loadPreferences().then((prefs) => {
      select.value = prefs.mockStoreId
      const dev = section.querySelector('#blh-dev-screen') as HTMLSelectElement
      dev.value = prefs.devScreenOverride ?? ''
    })
  })

  const form = section.querySelector('#blh-settings-form') as HTMLFormElement
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const status = section.querySelector('#blh-settings-status') as HTMLElement

    await chrome.storage.local.set({
      mockStoreId: String(fd.get('mockStoreId') ?? 'store-1'),
      devScreenOverride: String(fd.get('devScreenOverride') ?? '') || null,
    })

    await sendToContent({ type: MSG.GET_CONTEXT })
    status.textContent = 'Settings saved.'
    status.className = 'status success'
  })
}
