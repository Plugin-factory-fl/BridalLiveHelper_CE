import { MSG } from '../../lib/messages'
import { getDataSourceLabel } from '../../lib/data-source'
import { listStores } from '../../api/client'
import { loadPreferences } from '../../lib/storage'
import {
  credentialsStatusLabel,
  loadBridalLiveApiSettings,
  saveBridalLiveApiSettings,
  type BridalLiveApiEnvironment,
  type BridalLiveApiSettings,
  type BridalLiveLocationCredentials,
} from '../../lib/bridallive-credentials'
import {
  INVENTORY_COLUMN_IDS,
  INVENTORY_COLUMN_LABELS,
  loadInventoryUiState,
  saveInventoryUiState,
  type InventoryColumnVisibility,
} from '../../lib/inventory-ui-state'
import { sendToContent } from '../bridge-client'
import type { ViewRender } from '../router'

function locationFieldsHtml(loc: BridalLiveLocationCredentials): string {
  const prefix = `bl-loc-${loc.id}`
  return `
    <fieldset class="fieldset bl-api-location" data-location-id="${loc.id}">
      <legend>${loc.name}</legend>
      <input type="hidden" name="${prefix}-id" value="${loc.id}" />
      <input type="hidden" name="${prefix}-name" value="${loc.name}" />
      <label>Retailer ID
        <input
          type="text"
          name="${prefix}-retailerId"
          value="${escapeAttr(loc.retailerId)}"
          autocomplete="off"
          spellcheck="false"
          placeholder="From Settings → Account → API"
        />
      </label>
      <label>API key
        <input
          type="password"
          name="${prefix}-apiKey"
          value="${escapeAttr(loc.apiKey)}"
          autocomplete="off"
          spellcheck="false"
          placeholder="Paste API key"
        />
      </label>
    </fieldset>
  `
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function readLocationsFromForm(fd: FormData): BridalLiveLocationCredentials[] {
  const ids = ['white-plains', 'poughkeepsie']
  return ids.map((id) => {
    const prefix = `bl-loc-${id}`
    return {
      id: String(fd.get(`${prefix}-id`) ?? id),
      name: String(fd.get(`${prefix}-name`) ?? id),
      retailerId: String(fd.get(`${prefix}-retailerId`) ?? '').trim(),
      apiKey: String(fd.get(`${prefix}-apiKey`) ?? '').trim(),
    }
  })
}

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
      <fieldset class="fieldset" id="blh-inv-columns">
        <legend>Inventory columns</legend>
        <p class="muted small">Choose which columns appear in inventory browse and search results. Drag column edges in the table to resize.</p>
        <div class="inv-column-toggles" id="blh-inv-column-toggles"></div>
      </fieldset>
      <fieldset class="fieldset" id="blh-api-credentials">
        <legend>BridalLive API (Phase 2)</legend>
        <p class="muted small">
          Stored only in this browser (<code>chrome.storage.local</code>). Use QA credentials until sandbox testing is done; each location needs its own Retailer ID and API key.
        </p>
        <p class="bl-api-status muted small" id="blh-api-status" role="status"></p>
        <label>API environment
          <select name="blApiEnvironment" id="blh-api-env">
            <option value="qa">QA / Sandbox</option>
            <option value="production">Production</option>
          </select>
        </label>
        <label>Active location
          <select name="blApiActiveLocationId" id="blh-api-active-location">
            <option value="poughkeepsie">Poughkeepsie</option>
            <option value="white-plains">White Plains</option>
          </select>
        </label>
        <div id="blh-api-locations" class="bl-api-locations"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-api-clear">
          Clear API credentials
        </button>
      </fieldset>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
    <p id="blh-settings-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const badge = section.querySelector('#blh-data-source') as HTMLElement
  badge.textContent = `Data source: ${getDataSourceLabel()}`

  const togglesEl = section.querySelector('#blh-inv-column-toggles') as HTMLElement
  const locationsEl = section.querySelector('#blh-api-locations') as HTMLElement
  const apiStatusEl = section.querySelector('#blh-api-status') as HTMLElement
  const apiEnvSelect = section.querySelector('#blh-api-env') as HTMLSelectElement
  const apiActiveSelect = section.querySelector(
    '#blh-api-active-location',
  ) as HTMLSelectElement

  const applyApiSettingsToForm = (settings: BridalLiveApiSettings) => {
    apiEnvSelect.value = settings.environment
    apiActiveSelect.value = settings.activeLocationId
    locationsEl.innerHTML = settings.locations.map(locationFieldsHtml).join('')
    apiStatusEl.textContent = credentialsStatusLabel(settings)
  }

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

  void loadInventoryUiState().then((state) => {
    togglesEl.innerHTML = INVENTORY_COLUMN_IDS.map((id) => {
      const checked = state.columns[id] ? 'checked' : ''
      return `<label class="inv-column-toggle">
        <input type="checkbox" name="col-${id}" value="${id}" ${checked} />
        ${INVENTORY_COLUMN_LABELS[id]}
      </label>`
    }).join('')
  })

  void loadBridalLiveApiSettings().then(applyApiSettingsToForm)

  const form = section.querySelector('#blh-settings-form') as HTMLFormElement
  const status = section.querySelector('#blh-settings-status') as HTMLElement

  section.querySelector('#blh-api-clear')?.addEventListener('click', async () => {
    const cleared = await saveBridalLiveApiSettings({
      environment: (apiEnvSelect.value as BridalLiveApiEnvironment) || 'qa',
      activeLocationId: apiActiveSelect.value || 'poughkeepsie',
      locations: [
        { id: 'white-plains', name: 'White Plains', retailerId: '', apiKey: '' },
        { id: 'poughkeepsie', name: 'Poughkeepsie', retailerId: '', apiKey: '' },
      ],
    })
    applyApiSettingsToForm(cleared)
    status.textContent = 'API credentials cleared.'
    status.className = 'status success'
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)

    const columns = {} as InventoryColumnVisibility
    for (const id of INVENTORY_COLUMN_IDS) {
      columns[id] = fd.get(`col-${id}`) === id
    }
    // Keep at least one data column visible.
    if (!INVENTORY_COLUMN_IDS.some((id) => columns[id])) {
      columns.name = true
      columns.itemNumber = true
    }

    const apiSettings = await saveBridalLiveApiSettings({
      environment: (String(fd.get('blApiEnvironment') || 'qa') === 'production'
        ? 'production'
        : 'qa') as BridalLiveApiEnvironment,
      activeLocationId: String(fd.get('blApiActiveLocationId') || 'poughkeepsie'),
      locations: readLocationsFromForm(fd),
    })
    applyApiSettingsToForm(apiSettings)

    await chrome.storage.local.set({
      mockStoreId: String(fd.get('mockStoreId') ?? 'store-1'),
      devScreenOverride: String(fd.get('devScreenOverride') ?? '') || null,
    })
    await saveInventoryUiState({ columns })

    await sendToContent({ type: MSG.GET_CONTEXT })
    status.textContent = 'Settings saved.'
    status.className = 'status success'
  })
}
