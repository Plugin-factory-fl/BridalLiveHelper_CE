import { listStores } from '../../api/client'
import { MSG } from '../../lib/messages'
import { getPanelContext } from '../panel-context'
import { showModal } from '../modal'
import { copyableCellHtml, wireCopyItemButtons } from '../copy-item'
import { wireFieldClearButtons } from '../field-clear'
import { inventoryImageCellHtml } from '../inventory-image-cell'
import { sendToContent } from '../bridge-client'
import {
  INVENTORY_DEPARTMENTS,
  type InventoryItem,
  type InventorySearchQuery,
} from '../../types/inventory'
import type { BridalLiveContext } from '../../types/context'
import type { ViewRender } from '../router'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function prefillSearchFromOrder(form: HTMLFormElement, ctx: BridalLiveContext): void {
  const line = ctx.orderLine
  if (!line) return

  const set = (name: string, value?: string) => {
    if (!value) return
    const input = form.elements.namedItem(name) as HTMLInputElement | null
    if (input && !input.value.trim()) input.value = value
  }

  set('name', line.style)
  set('size', line.size)
  set('color', line.color)
  set('itemNumber', line.itemNumber)
}

function setFormField(form: HTMLFormElement, name: string, value: string): void {
  const el = form.elements.namedItem(name)
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    el.value = value
  }
}

type SourceItem = Pick<
  InventoryItem,
  'itemNumber' | 'style' | 'vendor' | 'department' | 'size' | 'color'
>

const BROWSE_PAGE_SIZE = 10

function readSearchQuery(form: HTMLFormElement): InventorySearchQuery {
  const fd = new FormData(form)
  return {
    locationId: String(fd.get('locationId') ?? '').trim(),
    department: String(fd.get('department') ?? '').trim(),
    name: String(fd.get('name') ?? '').trim(),
    vendor: String(fd.get('vendor') ?? '').trim(),
    size: String(fd.get('size') ?? '').trim(),
    color: String(fd.get('color') ?? '').trim(),
    itemNumber: String(fd.get('itemNumber') ?? '').trim(),
  }
}

function isSearchQueryEmpty(query: InventorySearchQuery): boolean {
  return (
    !query.locationId &&
    !query.department &&
    !query.name &&
    !query.vendor &&
    !query.size &&
    !query.color &&
    !query.itemNumber
  )
}

const departmentOptionsHtml = [
  '<option value="">All departments</option>',
  ...INVENTORY_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`),
].join('')

export const renderInventory: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-inventory'
  section.innerHTML = `
    <div id="blh-inv-order-banner" class="banner banner-info" hidden></div>
    <h2 class="view-title">Inventory</h2>
    <p class="muted">Search across all connected locations. Add a new size or color from an existing item in the results.</p>
    <form id="blh-inv-search" class="form-grid form-grid--clearable">
      <label>Location
        <span class="field-clear-wrap">
          <select name="locationId" id="blh-inv-location" aria-label="Location">
            <option value="">All locations</option>
          </select>
          <button type="button" class="field-clear-btn" hidden aria-label="Clear location" title="Clear">×</button>
        </span>
      </label>
      <label>Department
        <span class="field-clear-wrap">
          <select name="department" aria-label="Department">${departmentOptionsHtml}</select>
          <button type="button" class="field-clear-btn" hidden aria-label="Clear department" title="Clear">×</button>
        </span>
      </label>
      <label>Name
        <span class="field-clear-wrap">
          <input
            name="name"
            type="text"
            placeholder="CD55830"
            title="BL item name (full code from export)"
            autocomplete="off"
          />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear name" title="Clear">×</button>
        </span>
      </label>
      <label>Item #
        <span class="field-clear-wrap">
          <input name="itemNumber" type="text" inputmode="numeric" autocomplete="off" />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear item number" title="Clear">×</button>
        </span>
      </label>
      <label>Vendor
        <span class="field-clear-wrap">
          <input name="vendor" type="text" autocomplete="off" />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear vendor" title="Clear">×</button>
        </span>
      </label>
      <label>Size
        <span class="field-clear-wrap">
          <input name="size" type="text" placeholder="10" autocomplete="off" />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear size" title="Clear">×</button>
        </span>
      </label>
      <label>Color
        <span class="field-clear-wrap">
          <input name="color" type="text" placeholder="Lylac" autocomplete="off" />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear color" title="Clear">×</button>
        </span>
      </label>
      <button type="submit" class="btn btn-primary">Search</button>
    </form>

    <section class="inv-browse" id="blh-inv-browse" hidden aria-labelledby="blh-inv-browse-heading">
      <h3 class="subheading" id="blh-inv-browse-heading">Browse catalog</h3>
      <p class="muted small">Leave search fields empty and press Search · Sorted A–Z by item # · 10 per page</p>
      <div id="blh-inv-browse-table" class="inv-browse-table-wrap"></div>
      <div class="inv-browse-pager btn-row">
        <button type="button" class="btn btn-ghost btn-sm" id="blh-inv-page-prev" disabled>Previous</button>
        <span id="blh-inv-page-label" class="inv-browse-page-label">Page 1 of 10</span>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-inv-page-next">Next</button>
      </div>
    </section>

    <div id="blh-inv-results" class="results"></div>
    <p id="blh-inv-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const searchForm = section.querySelector('#blh-inv-search') as HTMLFormElement
  const browseSection = section.querySelector('#blh-inv-browse') as HTMLElement
  const resultsEl = section.querySelector('#blh-inv-results') as HTMLElement
  const orderBanner = section.querySelector('#blh-inv-order-banner') as HTMLElement
  const statusEl = section.querySelector('#blh-inv-status') as HTMLElement

  const setBrowseVisible = (visible: boolean) => {
    browseSection.hidden = !visible
  }

  const clearSearchResults = () => {
    resultsEl.innerHTML = ''
  }

  let currentStoreId = 'store-1'
  let catalogItems: InventoryItem[] = []
  let browsePage = 1

  void chrome.storage.local.get('mockStoreId').then((data) => {
    currentStoreId = String(data.mockStoreId ?? 'store-1')
  })

  async function loadLocationFilterOptions(): Promise<void> {
    const select = section.querySelector('#blh-inv-location') as HTMLSelectElement | null
    if (!select) return
    try {
      const stores = await listStores()
      select.innerHTML = [
        '<option value="">All locations</option>',
        ...stores.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`),
      ].join('')
    } catch {
      select.innerHTML = '<option value="">All locations</option>'
    }
    wireFieldClearButtons(searchForm)
  }

  const paintOrderBanner = () => {
    const ctx = getPanelContext()
    if (!ctx || ctx.screen !== 'order') {
      orderBanner.hidden = true
      return
    }
    orderBanner.hidden = false
    const line = ctx.orderLine
    if (line) {
      const parts = [
        line.itemNumber && `Item # ${line.itemNumber}`,
        line.style && `Style ${line.style}`,
        line.size && `Size ${line.size}`,
        line.color && `Color ${line.color}`,
      ].filter(Boolean)
      orderBanner.textContent = `Order screen — ${parts.join(' · ') || 'line detected'}`
    } else {
      orderBanner.textContent =
        'Order screen — search inventory here while you work the order.'
    }
  }

  const applyContextPrefill = () => {
    const ctx = getPanelContext()
    if (!ctx) return
    prefillSearchFromOrder(searchForm, ctx)
    paintOrderBanner()
    wireFieldClearButtons(searchForm)
  }

  function showDuplicateModal(message: string, onDismiss?: () => void): void {
    showModal(section, {
      title: 'Duplicate variant',
      body: message,
      variant: 'warn',
      primaryLabel: 'Got it',
      onPrimary: onDismiss,
    })
  }

  function locationCell(item: InventoryItem): string {
    const isHere = item.locationId === currentStoreId
    const cls = isHere ? 'loc-tag loc-tag--here' : 'loc-tag loc-tag--other'
    return `<span class="${cls}" title="${esc(item.locationName)}">${esc(item.locationName)}</span>`
  }

  const inventoryTableHeadHtml = `
    <tr>
      <th class="inv-image-col">Image</th>
      <th>Name</th>
      <th>Item #</th>
      <th>Dept</th>
      <th>Size</th>
      <th>Color</th>
      <th>Location</th>
      <th title="On hand quantity">Qty</th>
      <th class="inv-actions-col" aria-label="Actions"></th>
    </tr>
  `

  function inventoryRowActionsHtml(item: InventoryItem, onOrder: boolean): string {
    const variant = `<button type="button" class="btn btn-add-variant btn-sm btn-icon-action" data-add-variant title="Add another size or color for this style" aria-label="Add variant">+</button>`
    const order = onOrder
      ? `<button type="button" class="btn btn-add-to-order btn-sm btn-icon-action" data-apply="${esc(item.saleSearchQuery)}" title="Add to order" aria-label="Add to order">⊕</button>`
      : ''
    return `<span class="row-actions-compact">${variant}${order}</span>`
  }

  function inventoryItemRowHtml(item: InventoryItem, onOrder: boolean): string {
    return `
      <tr
        class="inv-item-row"
        data-item="${esc(item.itemNumber)}"
        data-style="${esc(item.style)}"
        data-vendor="${esc(item.vendor)}"
        data-department="${esc(item.department)}"
        data-size="${esc(item.size)}"
        data-color="${esc(item.color)}"
        data-sale-query="${esc(item.saleSearchQuery)}"
      >
        ${inventoryImageCellHtml(item, esc)}
        <td class="copyable-cell inv-truncate" title="${esc(item.style)}">${copyableCellHtml(item.style, esc, 'Copy name')}</td>
        <td class="copyable-cell inv-truncate" title="${esc(item.itemNumber)}">${copyableCellHtml(item.itemNumber, esc, 'Copy item number')}</td>
        <td class="inv-truncate" title="${esc(item.department)}">${esc(item.department)}</td>
        <td class="inv-truncate" title="${esc(item.size)}">${esc(item.size)}</td>
        <td class="inv-truncate" title="${esc(item.color)}">${esc(item.color)}</td>
        <td class="inv-loc-cell">${locationCell(item)}</td>
        <td class="inv-oh-cell">${item.onHand}</td>
        <td class="row-actions">${inventoryRowActionsHtml(item, onOrder)}</td>
      </tr>`
  }

  function renderInventoryTable(
    container: HTMLElement,
    items: InventoryItem[],
    mode: 'browse' | 'search',
  ): void {
    const onOrder = getPanelContext()?.screen === 'order'
    container.innerHTML = `
      <table class="data-table data-table--inventory">
        <colgroup>
          <col class="col-inv-img" />
          <col class="col-inv-name" />
          <col class="col-inv-num" />
          <col class="col-inv-dept" />
          <col class="col-inv-size" />
          <col class="col-inv-color" />
          <col class="col-inv-loc" />
          <col class="col-inv-oh" />
          <col class="col-inv-act" />
        </colgroup>
        <thead>${inventoryTableHeadHtml}</thead>
        <tbody>
          ${items.map((item) => inventoryItemRowHtml(item, onOrder)).join('')}
        </tbody>
      </table>
    `
    wireResultActions(container)
  }

  function openAddVariantModal(source: SourceItem): void {
    const host = section
    const overlay = document.createElement('div')
    overlay.className = 'blh-modal-host'
    overlay.innerHTML = `
      <div class="blh-modal-backdrop" data-close></div>
      <div class="blh-modal blh-modal--info" role="dialog" aria-modal="true">
        <h3 class="blh-modal-title">Add variant</h3>
        <div class="blh-variant-source">
          <p class="blh-variant-source-label">Adding to</p>
          <p class="blh-variant-source-item"><strong>${esc(source.style)}</strong> · ${esc(source.vendor)}</p>
          <p class="blh-variant-source-meta muted small">
            Item <code>${esc(source.itemNumber)}</code> · ${esc(source.department)} ·
            ${esc(source.size)} / ${esc(source.color)}
          </p>
        </div>
        <form id="blh-variant-modal-form" class="form-grid">
          <label>New size <input name="size" type="text" required placeholder="e.g. 14" autocomplete="off" /></label>
          <label>New color <input name="color" type="text" required placeholder="e.g. Ivory" autocomplete="off" /></label>
          <div class="blh-modal-actions blh-modal-actions--form">
            <button type="button" class="btn btn-secondary" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Create variant</button>
          </div>
        </form>
      </div>
    `

    host.appendChild(overlay)

    const close = () => overlay.remove()
    overlay.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', close)
    })

    const form = overlay.querySelector('#blh-variant-modal-form') as HTMLFormElement
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const size = String(fd.get('size') ?? '').trim()
      const color = String(fd.get('color') ?? '').trim()

      const dupRes = await sendToContent({
        type: MSG.INVENTORY_CHECK_DUPLICATE,
        styleId: source.style,
        size,
        color,
      })
      if (dupRes.search?.duplicateWarning) {
        showDuplicateModal(dupRes.search.duplicateWarning)
        return
      }

      const res = await sendToContent({
        type: MSG.INVENTORY_CREATE_VARIANT,
        payload: {
          styleId: source.style,
          size,
          color,
          sourceItemNumber: source.itemNumber,
        },
      })

      if (!res.ok || !res.variant) {
        statusEl.textContent = res.error ?? 'Failed'
        statusEl.className = 'status error'
        return
      }

      if (!res.variant.ok) {
        showDuplicateModal(res.variant.message)
        return
      }

      close()
      statusEl.textContent = res.variant.message
      statusEl.className = 'status success'

      if (res.variant.saleSearchQuery && getPanelContext()?.screen === 'order') {
        const apply = await sendToContent({
          type: MSG.APPLY_ITEM_TO_ORDER,
          saleSearchQuery: res.variant.saleSearchQuery,
        })
        if (apply.ok) {
          statusEl.textContent += apply.autoSelected
            ? ` Added ${res.variant.saleSearchQuery} to the order.`
            : ` Sale search: ${res.variant.saleSearchQuery} — pick from dropdown if needed.`
        }
      }

      searchForm.requestSubmit()
    })
  }

  function itemRowDataset(el: HTMLElement): SourceItem {
    return {
      itemNumber: el.dataset.item ?? '',
      style: el.dataset.style ?? '',
      vendor: el.dataset.vendor ?? '',
      department: el.dataset.department ?? '',
      size: el.dataset.size ?? '',
      color: el.dataset.color ?? '',
    }
  }

  function renderBrowseList(): void {
    const tableWrap = section.querySelector('#blh-inv-browse-table') as HTMLElement
    const pageLabel = section.querySelector('#blh-inv-page-label') as HTMLElement
    const prevBtn = section.querySelector('#blh-inv-page-prev') as HTMLButtonElement
    const nextBtn = section.querySelector('#blh-inv-page-next') as HTMLButtonElement

    const totalPages = Math.max(1, Math.ceil(catalogItems.length / BROWSE_PAGE_SIZE))
    browsePage = Math.min(Math.max(1, browsePage), totalPages)
    const start = (browsePage - 1) * BROWSE_PAGE_SIZE
    const pageItems = catalogItems.slice(start, start + BROWSE_PAGE_SIZE)

    if (catalogItems.length === 0) {
      tableWrap.innerHTML = '<p class="muted inv-browse-empty">Loading catalog…</p>'
      pageLabel.textContent = 'Page 1 of 10'
      prevBtn.disabled = true
      nextBtn.disabled = true
      return
    }

    renderInventoryTable(tableWrap, pageItems, 'browse')

    pageLabel.textContent = `Page ${browsePage} of ${totalPages}`
    prevBtn.disabled = browsePage <= 1
    nextBtn.disabled = browsePage >= totalPages
  }

  async function loadCatalogBrowse(): Promise<void> {
    const res = await sendToContent({ type: MSG.INVENTORY_LIST_CATALOG })
    if (res.ok && res.catalogItems?.length) {
      catalogItems = res.catalogItems
      browsePage = 1
      renderBrowseList()
    } else {
      const tableWrap = section.querySelector('#blh-inv-browse-table') as HTMLElement
      tableWrap.innerHTML = `<p class="error inv-browse-empty">${esc(res.error ?? 'Could not load catalog')}</p>`
    }
  }

  function wireResultActions(container: HTMLElement): void {
    wireCopyItemButtons(container)

    container.querySelectorAll('[data-apply]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const query = (btn as HTMLElement).dataset.apply
        if (!query) return
        const res = await sendToContent({
          type: MSG.APPLY_ITEM_TO_ORDER,
          saleSearchQuery: query,
        })
        if (res.ok) {
          statusEl.textContent = res.autoSelected
            ? `${query} added to the order.`
            : `${query} in sale search — pick the match if the dropdown shows more than one.`
          statusEl.className = 'status success'
        } else {
          statusEl.textContent = res.error ?? 'Could not apply to order'
          statusEl.className = 'status error'
        }
      })
    })

    container.querySelectorAll('[data-add-variant]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr.inv-item-row') as HTMLElement
        if (!row) return
        openAddVariantModal(itemRowDataset(row))
      })
    })
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const stored = await chrome.storage.local.get('mockStoreId')
    currentStoreId = String(stored.mockStoreId ?? 'store-1')

    const query = readSearchQuery(searchForm)
    statusEl.textContent = ''
    statusEl.className = 'status'

    if (isSearchQueryEmpty(query)) {
      setBrowseVisible(true)
      clearSearchResults()
      await loadCatalogBrowse()
      return
    }

    setBrowseVisible(false)
    clearSearchResults()

    const res = await sendToContent({
      type: MSG.INVENTORY_SEARCH,
      query,
    })

    if (!res.ok || !res.search) {
      resultsEl.innerHTML = `<p class="error">${esc(res.error ?? 'Search failed')}</p>`
      return
    }

    if (res.search.duplicateWarning) {
      showDuplicateModal(res.search.duplicateWarning)
    }

    if (res.search.items.length === 0) {
      resultsEl.innerHTML =
        '<p class="muted">No matches. Try another location, department, name, or item #.</p>'
      return
    }

    renderInventoryTable(resultsEl, res.search.items, 'search')
  })

  section.querySelector('#blh-inv-page-prev')?.addEventListener('click', () => {
    browsePage -= 1
    renderBrowseList()
  })
  section.querySelector('#blh-inv-page-next')?.addEventListener('click', () => {
    browsePage += 1
    renderBrowseList()
  })

  const onContextForBrowse = () => {
    applyContextPrefill()
    if (!browseSection.hidden && catalogItems.length > 0) renderBrowseList()
  }

  applyContextPrefill()
  void loadLocationFilterOptions()
  wireFieldClearButtons(searchForm)
  document.addEventListener('blh-context-updated', onContextForBrowse)

  return () => {
    document.removeEventListener('blh-context-updated', onContextForBrowse)
    section.querySelector('.blh-modal-host')?.remove()
  }
}
