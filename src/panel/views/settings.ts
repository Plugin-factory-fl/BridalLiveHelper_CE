import { MSG } from '../../lib/messages'
import { resolveDataSourceLabel } from '../../lib/data-source'
import {
  applyFontSizePreference,
  loadPreferences,
  savePreferences,
} from '../../lib/storage'
import type { FontSizePreference } from '../../lib/config'
import {
  INVENTORY_COLUMN_IDS,
  INVENTORY_COLUMN_LABELS,
  loadInventoryUiState,
  saveInventoryUiState,
  type InventoryColumnVisibility,
} from '../../lib/inventory-ui-state'
import { sendToContent } from '../bridge-client'
import type { ViewRender } from '../router'

export const renderSettings: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-settings'
  section.innerHTML = `
    <h2 class="view-title">Settings</h2>
    <p class="data-source-badge" id="blh-data-source"></p>
    <p class="muted small">
      Sign in on Home and pick the boutique you are working at. Inventory and labels use that location.
      Adding an item to a sale still uses the BridalLive tab you have open.
    </p>
    <form id="blh-settings-form" class="form-stack">
      <label>Text size
        <select name="fontSize" id="blh-font-size">
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <fieldset class="fieldset" id="blh-inv-columns">
        <legend>Inventory columns</legend>
        <p class="muted small">Choose which columns appear in search results. Drag a column edge in the table to resize.</p>
        <div class="inv-column-toggles" id="blh-inv-column-toggles"></div>
      </fieldset>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
    <p id="blh-settings-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const badge = section.querySelector('#blh-data-source') as HTMLElement
  const togglesEl = section.querySelector('#blh-inv-column-toggles') as HTMLElement
  const fontSizeSelect = section.querySelector('#blh-font-size') as HTMLSelectElement
  const status = section.querySelector('#blh-settings-status') as HTMLElement

  void resolveDataSourceLabel().then((label) => {
    badge.textContent = label
  })

  void loadPreferences().then((prefs) => {
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

  const form = section.querySelector('#blh-settings-form') as HTMLFormElement
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

    await savePreferences({
      fontSize: String(fd.get('fontSize') || 'small') as FontSizePreference,
    })
    applyFontSizePreference(String(fd.get('fontSize') || 'small') as FontSizePreference)
    await saveInventoryUiState({ columns })
    badge.textContent = await resolveDataSourceLabel()
    await sendToContent({ type: MSG.GET_CONTEXT })
    status.textContent = 'Settings saved.'
    status.className = 'status success'
  })
}
