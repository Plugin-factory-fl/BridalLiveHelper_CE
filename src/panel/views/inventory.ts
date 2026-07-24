import { listStores } from '../../api/client'
import { MSG } from '../../lib/messages'
import {
  INVENTORY_BROWSE_PAGE_SIZES,
  INVENTORY_COLUMN_IDS,
  INVENTORY_COLUMN_LABELS,
  loadInventoryUiState,
  saveInventoryUiState,
  type InventoryBrowsePageSize,
  type InventoryColumnId,
  type InventoryUiState,
} from '../../lib/inventory-ui-state'
import { getActiveBridalLiveCredentials } from '../../lib/bridallive-credentials'
import {
  checkDuplicateVariant,
  createVariant,
  listCatalogItems,
  searchInventory,
} from '../../inventory/service'
import { getPanelContext } from '../panel-context'
import { showModal } from '../modal'
import { copyableCellHtml, wireCopyItemButtons } from '../copy-item'
import { wireFieldClearButtons } from '../field-clear'
import { sendToContent } from '../bridge-client'
import {
  INVENTORY_DEPARTMENTS,
  type InventoryItem,
  type InventorySearchQuery,
} from '../../types/inventory'
import type { BridalLiveContext } from '../../types/context'
import type { ViewRender } from '../router'

async function resolveStoreId(): Promise<string> {
  const stored = await chrome.storage.local.get('mockStoreId')
  const fromPrefs = String(stored.mockStoreId ?? '').trim()
  if (fromPrefs) return fromPrefs
  const creds = await getActiveBridalLiveCredentials()
  return creds?.location.id ?? 'store-1'
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

/** Location shorthand for inventory table (Poughkeepsie → PK, not PO). */
function locationShorthand(name: string): string {
  const key = name.trim().toLowerCase()
  const known: Record<string, string> = {
    poughkeepsie: 'PK',
    'white plains': 'WP',
    'white-plains': 'WP',
    'main boutique': 'MB',
    'second location': 'SL',
  }
  if (known[key]) return known[key]

  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    // Prefer first + last significant word for multi-word names when not in map.
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '')
  return (cleaned.slice(0, 2) || '?').toUpperCase()
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

type SourceItem = Pick<
  InventoryItem,
  | 'id'
  | 'itemNumber'
  | 'style'
  | 'vendor'
  | 'vendorItemName'
  | 'department'
  | 'size'
  | 'color'
  | 'locationId'
>

const BROWSE_PAGE_SIZE_DEFAULT: InventoryBrowsePageSize = 10

type SortKey = InventoryColumnId
type SortDir = 'asc' | 'desc'

const DEFAULT_COL_WIDTHS: Record<InventoryColumnId, number> = {
  name: 72,
  vendorItemName: 72,
  itemNumber: 56,
  department: 48,
  size: 36,
  color: 64,
  location: 40,
  qty: 36,
}

function readSearchQuery(form: HTMLFormElement): InventorySearchQuery {
  const fd = new FormData(form)
  return {
    locationId: String(fd.get('locationId') ?? '').trim(),
    department: String(fd.get('department') ?? '').trim(),
    name: String(fd.get('name') ?? '').trim(),
    vendorItemName: String(fd.get('vendorItemName') ?? '').trim(),
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
    !query.vendorItemName &&
    !query.vendor &&
    !query.size &&
    !query.color &&
    !query.itemNumber
  )
}

function sortValue(item: InventoryItem, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return item.style.toLowerCase()
    case 'vendorItemName':
      return item.vendorItemName.toLowerCase()
    case 'itemNumber':
      return item.itemNumber.toLowerCase()
    case 'department':
      return item.department.toLowerCase()
    case 'size':
      return item.size.toLowerCase()
    case 'color':
      return item.color.toLowerCase()
    case 'location':
      return item.locationName.toLowerCase()
    case 'qty':
      return item.onHand
  }
}

function sortItems(items: InventoryItem[], key: SortKey, dir: SortDir): InventoryItem[] {
  const mult = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult
    return String(av).localeCompare(String(bv)) * mult
  })
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
      <label>Vendor item name
        <span class="field-clear-wrap">
          <input
            name="vendorItemName"
            type="text"
            placeholder="j879"
            title="BL vendor item name (private label / manufacturer name)"
            autocomplete="off"
          />
          <button type="button" class="field-clear-btn" hidden aria-label="Clear vendor item name" title="Clear">×</button>
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
      <div class="inv-browse-header">
        <div>
          <h3 class="subheading" id="blh-inv-browse-heading">Browse catalog</h3>
          <p class="muted small" id="blh-inv-browse-hint">Leave search fields empty and press Search · Click a column header to sort</p>
        </div>
        <label class="inv-page-size">
          Show
          <select id="blh-inv-page-size" aria-label="Items per page">
            ${INVENTORY_BROWSE_PAGE_SIZES.map(
              (n) => `<option value="${n}">${n}</option>`,
            ).join('')}
          </select>
          per page
        </label>
      </div>
      <div id="blh-inv-browse-table" class="inv-browse-table-wrap"></div>
      <div class="inv-browse-pager btn-row">
        <button type="button" class="btn btn-ghost btn-sm" id="blh-inv-page-prev" disabled>Previous</button>
        <span id="blh-inv-page-label" class="inv-browse-page-label">Page 1</span>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-inv-page-next">Next</button>
      </div>
    </section>

    <p id="blh-inv-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const searchForm = section.querySelector('#blh-inv-search') as HTMLFormElement
  const browseSection = section.querySelector('#blh-inv-browse') as HTMLElement
  const listHeading = section.querySelector('#blh-inv-browse-heading') as HTMLElement
  const listHint = section.querySelector('#blh-inv-browse-hint') as HTMLElement
  const tableWrap = section.querySelector('#blh-inv-browse-table') as HTMLElement
  const pageLabel = section.querySelector('#blh-inv-page-label') as HTMLElement
  const prevBtn = section.querySelector('#blh-inv-page-prev') as HTMLButtonElement
  const nextBtn = section.querySelector('#blh-inv-page-next') as HTMLButtonElement
  const orderBanner = section.querySelector('#blh-inv-order-banner') as HTMLElement
  const statusEl = section.querySelector('#blh-inv-status') as HTMLElement

  const setListVisible = (visible: boolean) => {
    browseSection.hidden = !visible
  }

  let currentStoreId = 'store-1'
  /** Active browse/search result set (always shown with pagination). */
  let listItems: InventoryItem[] = []
  let listPage = 1
  let sortKey: SortKey = 'itemNumber'
  let sortDir: SortDir = 'asc'
  let uiState: InventoryUiState = {
    columns: {
      name: true,
      vendorItemName: true,
      itemNumber: true,
      department: false,
      size: true,
      color: true,
      location: true,
      qty: true,
    },
    columnWidths: {},
    browsePageSize: BROWSE_PAGE_SIZE_DEFAULT,
  }
  let tableMode: 'browse' | 'search' = 'browse'
  const pageSizeSelect = section.querySelector('#blh-inv-page-size') as HTMLSelectElement

  void resolveStoreId().then((id) => {
    currentStoreId = id
  })

  void loadInventoryUiState().then((state) => {
    uiState = state
    pageSizeSelect.value = String(state.browsePageSize)
    refreshVisibleTables()
  })

  function pageSize(): InventoryBrowsePageSize {
    return uiState.browsePageSize
  }

  function loadingHtml(message: string): string {
    return `
      <div class="inv-loading" role="status" aria-live="polite">
        <span class="inv-spinner" aria-hidden="true"></span>
        <span class="inv-loading-text">${esc(message)}</span>
      </div>
    `
  }

  function showLoading(message: string): void {
    tableWrap.innerHTML = loadingHtml(message)
    pageLabel.textContent = 'Loading…'
    prevBtn.disabled = true
    nextBtn.disabled = true
  }

  function scrollToInventoryList(): void {
    requestAnimationFrame(() => {
      browseSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function setListChrome(mode: 'browse' | 'search'): void {
    tableMode = mode
    if (mode === 'browse') {
      listHeading.textContent = 'Browse catalog'
      listHint.textContent =
        'Leave search fields empty and press Search · Click a column header to sort'
    } else {
      listHeading.textContent = 'Search results'
      listHint.textContent =
        'Filtered inventory · Click a column header to sort · Use pages below to browse matches'
    }
  }

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

  function showVariantCreatedModal(message: string): void {
    showModal(section, {
      title: 'Variant created',
      body: message,
      variant: 'info',
      primaryLabel: 'Got it',
    })
  }

  function setInventoryStatus(
    message: string,
    kind: 'success' | 'error' | '' = '',
  ): void {
    statusEl.textContent = message
    statusEl.className = kind ? `status ${kind}` : 'status'
  }

  async function runInventoryQuery(options?: {
    keepStatus?: { message: string; kind: 'success' | 'error' }
  }): Promise<void> {
    currentStoreId = await resolveStoreId()
    const query = readSearchQuery(searchForm)

    if (!options?.keepStatus) {
      setInventoryStatus('')
    }

    if (isSearchQueryEmpty(query)) {
      await loadCatalogBrowse()
      if (options?.keepStatus) {
        setInventoryStatus(options.keepStatus.message, options.keepStatus.kind)
      }
      return
    }

    setListChrome('search')
    setListVisible(true)
    listItems = []
    showLoading('Searching inventory…')
    scrollToInventoryList()

    try {
      const search = await searchInventory(query, currentStoreId)

      if (search.duplicateWarning && !options?.keepStatus) {
        showDuplicateModal(search.duplicateWarning)
      }

      showPagedItems(search.items, 'search')
    } catch (err) {
      listItems = []
      tableWrap.innerHTML = `<p class="error inv-browse-empty">${esc(
        err instanceof Error ? err.message : 'Search failed',
      )}</p>`
      pageLabel.textContent = 'Page 1 of 1'
      prevBtn.disabled = true
      nextBtn.disabled = true
      scrollToInventoryList()
      if (!options?.keepStatus) {
        setInventoryStatus(
          err instanceof Error ? err.message : 'Search failed',
          'error',
        )
      }
    }

    if (options?.keepStatus) {
      setInventoryStatus(options.keepStatus.message, options.keepStatus.kind)
    }
  }

  function visibleColumns(): InventoryColumnId[] {
    return INVENTORY_COLUMN_IDS.filter((id) => uiState.columns[id])
  }

  function colWidth(id: InventoryColumnId): number {
    return uiState.columnWidths[id] ?? DEFAULT_COL_WIDTHS[id]
  }

  function locationCell(item: InventoryItem): string {
    const isHere = item.locationId === currentStoreId
    const cls = isHere ? 'loc-tag loc-tag--here' : 'loc-tag loc-tag--other'
    const short = locationShorthand(item.locationName)
    return `<span class="${cls}" title="${esc(item.locationName)}">${esc(short)}</span>`
  }

  function sortIndicator(id: InventoryColumnId): string {
    if (sortKey !== id) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  function inventoryTableHeadHtml(cols: InventoryColumnId[]): string {
    const ths = cols
      .map((id) => {
        const label = INVENTORY_COLUMN_LABELS[id]
        const title =
          id === 'qty'
            ? 'On hand quantity'
            : id === 'location'
              ? 'Location (abbreviated)'
              : label
        return `<th
          class="inv-th-sortable"
          data-sort="${id}"
          title="${esc(title)} — click to sort"
          aria-sort="${sortKey === id ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"
        ><span class="inv-th-label">${esc(label)}${sortIndicator(id)}</span><span class="inv-col-resize" data-resize="${id}" title="Drag to resize"></span></th>`
      })
      .join('')
    return `<tr>${ths}<th class="inv-actions-col" aria-label="Actions"></th></tr>`
  }

  function cellForColumn(item: InventoryItem, id: InventoryColumnId): string {
    switch (id) {
      case 'name':
        return `<td class="copyable-cell inv-truncate" title="${esc(item.style)}">${copyableCellHtml(item.style, esc, 'Copy name')}</td>`
      case 'vendorItemName':
        return `<td class="copyable-cell inv-truncate" title="${esc(item.vendorItemName)}">${copyableCellHtml(item.vendorItemName, esc, 'Copy vendor item name')}</td>`
      case 'itemNumber':
        return `<td class="copyable-cell inv-truncate" title="${esc(item.itemNumber)}">${copyableCellHtml(item.itemNumber, esc, 'Copy item number')}</td>`
      case 'department':
        return `<td class="inv-truncate" title="${esc(item.department)}">${esc(item.department)}</td>`
      case 'size':
        return `<td class="inv-truncate" title="${esc(item.size)}">${esc(item.size)}</td>`
      case 'color':
        return `<td class="inv-truncate" title="${esc(item.color)}">${esc(item.color)}</td>`
      case 'location':
        return `<td class="inv-loc-cell">${locationCell(item)}</td>`
      case 'qty':
        return `<td class="inv-oh-cell">${item.onHand}</td>`
    }
  }

  function inventoryRowActionsHtml(item: InventoryItem, onOrder: boolean): string {
    const variant = `<button type="button" class="btn btn-add-variant btn-sm btn-icon-action" data-add-variant title="Add another size or color for this style" aria-label="Add variant">+</button>`
    const order = onOrder
      ? `<button type="button" class="btn btn-add-to-order btn-sm btn-icon-action" data-apply="${esc(item.itemNumber)}" data-item-id="${esc(item.id)}" data-item-number="${esc(item.itemNumber)}" title="Add to order" aria-label="Add to order">⊕</button>`
      : ''
    return `<span class="row-actions-compact">${variant}${order}</span>`
  }

  function inventoryItemRowHtml(
    item: InventoryItem,
    onOrder: boolean,
    cols: InventoryColumnId[],
  ): string {
    return `
      <tr
        class="inv-item-row"
        data-id="${esc(item.id)}"
        data-item="${esc(item.itemNumber)}"
        data-style="${esc(item.style)}"
        data-vendor="${esc(item.vendor)}"
        data-vendor-item-name="${esc(item.vendorItemName)}"
        data-department="${esc(item.department)}"
        data-size="${esc(item.size)}"
        data-color="${esc(item.color)}"
        data-location-id="${esc(item.locationId)}"
        data-sale-query="${esc(item.saleSearchQuery)}"
      >
        ${cols.map((id) => cellForColumn(item, id)).join('')}
        <td class="row-actions">${inventoryRowActionsHtml(item, onOrder)}</td>
      </tr>`
  }

  function renderInventoryTable(items: InventoryItem[]): void {
    const cols = visibleColumns()
    const onOrder = getPanelContext()?.screen === 'order'
    const colgroup = cols
      .map(
        (id) =>
          `<col class="col-inv-${id}" data-col="${id}" style="width:${colWidth(id)}px" />`,
      )
      .join('')

    tableWrap.innerHTML = `
      <table class="data-table data-table--inventory">
        <colgroup>
          ${colgroup}
          <col class="col-inv-act" style="width:52px" />
        </colgroup>
        <thead>${inventoryTableHeadHtml(cols)}</thead>
        <tbody>
          ${items.map((item) => inventoryItemRowHtml(item, onOrder, cols)).join('')}
        </tbody>
      </table>
    `
    wireResultActions(tableWrap)
    wireTableChrome(tableWrap)
  }

  function refreshVisibleTables(): void {
    if (!browseSection.hidden && listItems.length > 0) {
      renderPagedList()
    }
  }

  function renderPagedList(): void {
    const size = pageSize()
    const sorted = sortItems(listItems, sortKey, sortDir)
    const totalPages = Math.max(1, Math.ceil(sorted.length / size))
    listPage = Math.min(Math.max(1, listPage), totalPages)
    const start = (listPage - 1) * size
    const pageItems = sorted.slice(start, start + size)

    if (listItems.length === 0) {
      tableWrap.innerHTML =
        tableMode === 'search'
          ? '<p class="muted inv-browse-empty">No matches. Try another location, department, name, vendor item name, or item #.</p>'
          : '<p class="muted inv-browse-empty">No inventory to browse yet.</p>'
      pageLabel.textContent = 'Page 1 of 1'
      prevBtn.disabled = true
      nextBtn.disabled = true
      return
    }

    renderInventoryTable(pageItems)

    const totalLabel =
      listItems.length === 1 ? '1 item' : `${listItems.length} items`
    pageLabel.textContent = `Page ${listPage} of ${totalPages} · ${totalLabel}`
    prevBtn.disabled = listPage <= 1
    nextBtn.disabled = listPage >= totalPages
  }

  function showPagedItems(
    items: InventoryItem[],
    mode: 'browse' | 'search',
  ): void {
    listItems = items
    listPage = 1
    setListChrome(mode)
    setListVisible(true)
    renderPagedList()
    scrollToInventoryList()
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
          <label>Vendor item name
            <input
              name="vendorItemName"
              type="text"
              required
              value="${esc(source.vendorItemName)}"
              placeholder="Manufacturer / vendor style name"
              autocomplete="off"
            />
          </label>
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
    const sizeInput = form.elements.namedItem('size') as HTMLInputElement | null
    sizeInput?.focus()

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      const size = String(fd.get('size') ?? '').trim()
      const color = String(fd.get('color') ?? '').trim()
      const vendorItemName = String(fd.get('vendorItemName') ?? '').trim()
      const submitBtn = form.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null

      if (!vendorItemName) {
        showDuplicateModal(
          'Vendor item name is required. Enter the manufacturer / vendor style name (do not leave it blank).',
        )
        return
      }

      if (
        size.toLowerCase() === source.size.trim().toLowerCase() &&
        color.toLowerCase() === source.color.trim().toLowerCase()
      ) {
        showDuplicateModal(
          `This style + size + color already exists as item ${source.itemNumber} (${source.size} / ${source.color}). Enter a different size or color.`,
        )
        return
      }

      try {
        if (submitBtn) submitBtn.disabled = true
        const storeId = await resolveStoreId()
        const duplicateWarning = await checkDuplicateVariant(
          source.style,
          size,
          color,
          storeId,
        )
        if (duplicateWarning) {
          showDuplicateModal(duplicateWarning)
          return
        }

        const variant = await createVariant(
          {
            styleId: source.style,
            size,
            color,
            vendorItemName,
            sourceItemNumber: source.itemNumber,
            sourceInventoryItemId: source.id,
            sourceLocationId: source.locationId,
          },
          storeId,
        )

        if (!variant.ok) {
          showDuplicateModal(variant.message)
          return
        }

        close()
        const itemLabel = variant.itemNumber ? `item #${variant.itemNumber}` : 'a new item'
        const successMsg =
          `Variant created in BridalLive as ${itemLabel}` +
          ` (${size} / ${color}) for ${source.style}` +
          ` · vendor item name “${vendorItemName}”.` +
          ` Use ⊕ Add to order if you want it on the open sale.`

        showVariantCreatedModal(successMsg)
        setInventoryStatus(successMsg, 'success')

        // Look up the new item # so it appears even if prior filters wouldn't match.
        if (variant.itemNumber) {
          const itemNumberInput = searchForm.elements.namedItem(
            'itemNumber',
          ) as HTMLInputElement | null
          const locationSelect = searchForm.elements.namedItem(
            'locationId',
          ) as HTMLSelectElement | null
          if (itemNumberInput) itemNumberInput.value = variant.itemNumber
          if (locationSelect && source.locationId) {
            locationSelect.value = source.locationId
          }
          // Clear competing filters that could hide the new row.
          for (const name of ['name', 'vendorItemName', 'vendor', 'size', 'color', 'department']) {
            const el = searchForm.elements.namedItem(name) as
              | HTMLInputElement
              | HTMLSelectElement
              | null
            if (el) el.value = ''
          }
          wireFieldClearButtons(searchForm)
        }

        await runInventoryQuery({
          keepStatus: { message: successMsg, kind: 'success' },
        })
      } catch (err) {
        setInventoryStatus(
          err instanceof Error ? err.message : 'Failed to create variant',
          'error',
        )
      } finally {
        if (submitBtn) submitBtn.disabled = false
      }
    })
  }

  function itemRowDataset(el: HTMLElement): SourceItem {
    return {
      id: el.dataset.id ?? '',
      itemNumber: el.dataset.item ?? '',
      style: el.dataset.style ?? '',
      vendor: el.dataset.vendor ?? '',
      vendorItemName: el.dataset.vendorItemName ?? '',
      department: el.dataset.department ?? '',
      size: el.dataset.size ?? '',
      color: el.dataset.color ?? '',
      locationId: el.dataset.locationId ?? '',
    }
  }

  async function loadCatalogBrowse(): Promise<void> {
    setListChrome('browse')
    setListVisible(true)
    showLoading('Loading inventory…')
    scrollToInventoryList()

    try {
      const storeId = await resolveStoreId()
      currentStoreId = storeId
      const items = await listCatalogItems(storeId)
      if (items.length) {
        showPagedItems(items, 'browse')
      } else {
        listItems = []
        tableWrap.innerHTML =
          '<p class="muted inv-browse-empty">No inventory returned for this location. Check API credentials and environment (QA vs Production).</p>'
        pageLabel.textContent = 'Page 1 of 1'
        prevBtn.disabled = true
        nextBtn.disabled = true
      }
    } catch (err) {
      listItems = []
      tableWrap.innerHTML = `<p class="error inv-browse-empty">${esc(
        err instanceof Error ? err.message : 'Could not load catalog',
      )}</p>`
      pageLabel.textContent = 'Page 1 of 1'
      prevBtn.disabled = true
      nextBtn.disabled = true
    }
  }

  function wireTableChrome(container: HTMLElement): void {
    container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-resize]')) return
        const key = (th as HTMLElement).dataset.sort as SortKey | undefined
        if (!key) return
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc'
        } else {
          sortKey = key
          sortDir = 'asc'
        }
        renderPagedList()
      })
    })

    container.querySelectorAll('[data-resize]').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const id = (handle as HTMLElement).dataset.resize as InventoryColumnId | undefined
        if (!id) return
        const startX = (e as MouseEvent).clientX
        const startW = colWidth(id)
        const col = container.querySelector(`col[data-col="${id}"]`) as HTMLElement | null

        const onMove = (ev: MouseEvent) => {
          const next = Math.max(28, Math.min(220, startW + (ev.clientX - startX)))
          uiState.columnWidths[id] = next
          if (col) col.style.width = `${next}px`
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          void saveInventoryUiState({ columnWidths: { [id]: colWidth(id) } })
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
    })
  }

  function wireResultActions(container: HTMLElement): void {
    wireCopyItemButtons(container)

    container.querySelectorAll('[data-apply]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement
        const itemNumber = (el.dataset.itemNumber ?? el.dataset.apply ?? '').trim()
        if (!itemNumber) return
        statusEl.textContent = `Adding item #${itemNumber} to the sale…`
        statusEl.className = 'status'
        const res = await sendToContent({
          type: MSG.APPLY_ITEM_TO_ORDER,
          saleSearchQuery: itemNumber,
          itemNumber,
          inventoryItemId: el.dataset.itemId,
        })
        if (res.ok) {
          const via = res.addMethod === 'api' ? ' via API' : ''
          statusEl.textContent =
            res.message ??
            `Item #${itemNumber} added to the order${via}.${
              res.addMethod === 'api' ? ' Refreshing sale…' : ''
            }`
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
    await runInventoryQuery()
  })

  pageSizeSelect.addEventListener('change', () => {
    const next = Number(pageSizeSelect.value) as InventoryBrowsePageSize
    if (!INVENTORY_BROWSE_PAGE_SIZES.includes(next)) return
    uiState.browsePageSize = next
    listPage = 1
    void saveInventoryUiState({ browsePageSize: next })
    if (!browseSection.hidden && listItems.length > 0) {
      renderPagedList()
    }
  })

  section.querySelector('#blh-inv-page-prev')?.addEventListener('click', () => {
    listPage -= 1
    renderPagedList()
  })
  section.querySelector('#blh-inv-page-next')?.addEventListener('click', () => {
    listPage += 1
    renderPagedList()
  })

  const onContextForBrowse = () => {
    applyContextPrefill()
    if (!browseSection.hidden && listItems.length > 0) renderPagedList()
  }

  const onStorageChanged = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local' || !changes.inventoryUiState) return
    void loadInventoryUiState().then((state) => {
      uiState = state
      pageSizeSelect.value = String(state.browsePageSize)
      refreshVisibleTables()
    })
  }
  chrome.storage.onChanged.addListener(onStorageChanged)

  applyContextPrefill()
  void loadLocationFilterOptions()
  wireFieldClearButtons(searchForm)
  document.addEventListener('blh-context-updated', onContextForBrowse)

  return () => {
    document.removeEventListener('blh-context-updated', onContextForBrowse)
    chrome.storage.onChanged.removeListener(onStorageChanged)
    section.querySelector('.blh-modal-host')?.remove()
  }
}
