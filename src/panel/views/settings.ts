import { MSG } from '../../lib/messages'
import { resolveDataSourceLabel } from '../../lib/data-source'
import { listStores } from '../../api/client'
import {
  applyFontSizePreference,
  loadPreferences,
  savePreferences,
} from '../../lib/storage'
import type { FontSizePreference } from '../../lib/config'
import { clearBridalLiveSessions, testBridalLiveConnection } from '../../lib/bridallive-auth'
import {
  credentialsStatusLabel,
  isLocationConfigured,
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
    <p class="muted small">
      When Retailer ID + API key are saved below, inventory search and variant create use the BridalLive API.
      Add-to-order still uses the open BridalLive tab.
    </p>
    <form id="blh-settings-form" class="form-stack">
      <label>Text size
        <select name="fontSize" id="blh-font-size">
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <label>Active store
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
        <legend>BridalLive API</legend>
        <p class="muted small">
          Stored only in this browser. Use <strong>QA</strong> until sandbox testing is done. Each location needs its own Retailer ID and API key from Settings → Account → API.
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
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-sm" id="blh-api-test">
            Test API connection
          </button>
          <button type="button" class="btn btn-ghost btn-sm" id="blh-api-clear">
            Clear API credentials
          </button>
        </div>
      </fieldset>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
    <p id="blh-settings-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const badge = section.querySelector('#blh-data-source') as HTMLElement
  const togglesEl = section.querySelector('#blh-inv-column-toggles') as HTMLElement
  const locationsEl = section.querySelector('#blh-api-locations') as HTMLElement
  const apiStatusEl = section.querySelector('#blh-api-status') as HTMLElement
  const apiEnvSelect = section.querySelector('#blh-api-env') as HTMLSelectElement
  const apiActiveSelect = section.querySelector(
    '#blh-api-active-location',
  ) as HTMLSelectElement
  const storeSelect = section.querySelector('#blh-store-select') as HTMLSelectElement
  const fontSizeSelect = section.querySelector('#blh-font-size') as HTMLSelectElement
  const status = section.querySelector('#blh-settings-status') as HTMLElement

  const refreshDataSourceBadge = async () => {
    badge.textContent = `Data source: ${await resolveDataSourceLabel()}`
  }

  const refreshStoreSelect = async (preferredId?: string) => {
    const stores = await listStores()
    const prefs = await loadPreferences()
    const selected = preferredId || prefs.mockStoreId
    storeSelect.innerHTML = stores
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join('')
    if (stores.some((s) => s.id === selected)) {
      storeSelect.value = selected
    } else if (stores[0]) {
      storeSelect.value = stores[0].id
    }
  }

  const applyApiSettingsToForm = (settings: BridalLiveApiSettings) => {
    apiEnvSelect.value = settings.environment
    apiActiveSelect.value = settings.activeLocationId
    locationsEl.innerHTML = settings.locations.map(locationFieldsHtml).join('')
    apiStatusEl.textContent = credentialsStatusLabel(settings)
  }

  void refreshDataSourceBadge()
  void refreshStoreSelect().then(async () => {
    const prefs = await loadPreferences()
    const dev = section.querySelector('#blh-dev-screen') as HTMLSelectElement
    dev.value = prefs.devScreenOverride ?? ''
    fontSizeSelect.value = prefs.fontSize
  })

  fontSizeSelect.addEventListener('change', () => {
    applyFontSizePreference(fontSizeSelect.value as FontSizePreference)
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

  section.querySelector('#blh-api-test')?.addEventListener('click', async () => {
    status.textContent = 'Testing API login…'
    status.className = 'status'
    try {
      clearBridalLiveSessions()
      const draft = await saveBridalLiveApiSettings({
        environment: (apiEnvSelect.value as BridalLiveApiEnvironment) || 'qa',
        activeLocationId: apiActiveSelect.value || 'poughkeepsie',
        locations: readLocationsFromForm(new FormData(form)),
      })
      applyApiSettingsToForm(draft)
      const message = await testBridalLiveConnection(draft.activeLocationId)
      status.textContent = message
      status.className = 'status success'
      await refreshDataSourceBadge()
      await refreshStoreSelect(draft.activeLocationId)
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'API test failed'
      status.className = 'status error'
    }
  })

  section.querySelector('#blh-api-clear')?.addEventListener('click', async () => {
    clearBridalLiveSessions()
    const cleared = await saveBridalLiveApiSettings({
      environment: (apiEnvSelect.value as BridalLiveApiEnvironment) || 'qa',
      activeLocationId: apiActiveSelect.value || 'poughkeepsie',
      locations: [
        { id: 'white-plains', name: 'White Plains', retailerId: '', apiKey: '' },
        { id: 'poughkeepsie', name: 'Poughkeepsie', retailerId: '', apiKey: '' },
      ],
    })
    applyApiSettingsToForm(cleared)
    await refreshStoreSelect()
    await refreshDataSourceBadge()
    status.textContent = 'API credentials cleared. Inventory will use mock data.'
    status.className = 'status success'
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)

    const columns = {} as InventoryColumnVisibility
    for (const id of INVENTORY_COLUMN_IDS) {
      columns[id] = fd.get(`col-${id}`) === id
    }
    if (!INVENTORY_COLUMN_IDS.some((id) => columns[id])) {
      columns.name = true
      columns.itemNumber = true
    }

    clearBridalLiveSessions()
    const apiSettings = await saveBridalLiveApiSettings({
      environment: (String(fd.get('blApiEnvironment') || 'qa') === 'production'
        ? 'production'
        : 'qa') as BridalLiveApiEnvironment,
      activeLocationId: String(fd.get('blApiActiveLocationId') || 'poughkeepsie'),
      locations: readLocationsFromForm(fd),
    })
    applyApiSettingsToForm(apiSettings)

    const activeConfigured = apiSettings.locations.find(
      (l) => l.id === apiSettings.activeLocationId && isLocationConfigured(l),
    )
    const storeId =
      activeConfigured?.id ||
      String(fd.get('mockStoreId') ?? '') ||
      apiSettings.activeLocationId

    await savePreferences({
      mockStoreId: storeId,
      devScreenOverride: String(fd.get('devScreenOverride') ?? '') || null,
      fontSize: (String(fd.get('fontSize') || 'small') as FontSizePreference),
    })
    applyFontSizePreference(
      (String(fd.get('fontSize') || 'small') as FontSizePreference),
    )
    await saveInventoryUiState({ columns })
    await refreshStoreSelect(storeId)
    await refreshDataSourceBadge()

    await sendToContent({ type: MSG.GET_CONTEXT })
    status.textContent = activeConfigured
      ? 'Settings saved. Inventory will use BridalLive API.'
      : 'Settings saved.'
    status.className = 'status success'
  })
}
