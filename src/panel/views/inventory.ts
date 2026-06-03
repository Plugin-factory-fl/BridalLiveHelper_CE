import { MSG } from '../../lib/messages'
import { getPanelContext } from '../panel-context'
import { showModal } from '../modal'
import { itemNumberCellHtml, wireCopyItemButtons } from '../copy-item'
import { sendToContent } from '../bridge-client'
import type { InventoryItem } from '../../types/inventory'
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

  set('style', line.style)
  set('size', line.size)
  set('color', line.color)
  set('itemNumber', line.itemNumber)
}

type SourceItem = Pick<
  InventoryItem,
  'itemNumber' | 'style' | 'vendor' | 'department' | 'size' | 'color'
>

const BROWSE_PAGE_SIZE = 10

export const renderInventory: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-inventory'
  section.innerHTML = `
    <div id="blh-inv-order-banner" class="banner banner-info" hidden></div>
    <h2 class="view-title">Inventory</h2>
    <p class="muted">Search across all connected locations. Add a new size or color from an existing item in the results.</p>
    <form id="blh-inv-search" class="form-grid">
      <label>Style <input name="style" type="text" placeholder="Iris" autocomplete="off" /></label>
      <label>Vendor <input name="vendor" type="text" autocomplete="off" /></label>
      <label>Size <input name="size" type="text" placeholder="10" autocomplete="off" /></label>
      <label>Color <input name="color" type="text" placeholder="Light Pink" autocomplete="off" /></label>
      <label>Item # <input name="itemNumber" type="text" autocomplete="off" /></label>
      <button type="submit" class="btn btn-primary">Search</button>
    </form>

    <section class="inv-browse" id="blh-inv-browse" aria-labelledby="blh-inv-browse-heading">
      <h3 class="subheading" id="blh-inv-browse-heading">Browse catalog</h3>
      <p class="muted small">Sorted A–Z by item # · 10 per page · Add to order searches BL by item #</p>
      <ul id="blh-inv-browse-list" class="inv-browse-list"></ul>
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
  const orderBanner = section.querySelector('#blh-inv-order-banner') as HTMLElement
  const statusEl = section.querySelector('#blh-inv-status') as HTMLElement

  let currentStoreId = 'store-1'
  let catalogItems: InventoryItem[] = []
  let browsePage = 1

  void chrome.storage.local.get('mockStoreId').then((data) => {
    currentStoreId = String(data.mockStoreId ?? 'store-1')
  })

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
    return `<span class="${cls}">${esc(item.locationName)}</span>`
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
    const list = section.querySelector('#blh-inv-browse-list') as HTMLElement
    const pageLabel = section.querySelector('#blh-inv-page-label') as HTMLElement
    const prevBtn = section.querySelector('#blh-inv-page-prev') as HTMLButtonElement
    const nextBtn = section.querySelector('#blh-inv-page-next') as HTMLButtonElement

    const totalPages = Math.max(1, Math.ceil(catalogItems.length / BROWSE_PAGE_SIZE))
    browsePage = Math.min(Math.max(1, browsePage), totalPages)
    const start = (browsePage - 1) * BROWSE_PAGE_SIZE
    const pageItems = catalogItems.slice(start, start + BROWSE_PAGE_SIZE)
    const onOrder = getPanelContext()?.screen === 'order'

    if (catalogItems.length === 0) {
      list.innerHTML = '<li class="muted inv-browse-empty">Loading catalog…</li>'
      pageLabel.textContent = 'Page 1 of 10'
      prevBtn.disabled = true
      nextBtn.disabled = true
      return
    }

    list.innerHTML = pageItems
      .map(
        (item) => `
      <li
        class="inv-browse-item"
        data-item="${esc(item.itemNumber)}"
        data-style="${esc(item.style)}"
        data-vendor="${esc(item.vendor)}"
        data-department="${esc(item.department)}"
        data-size="${esc(item.size)}"
        data-color="${esc(item.color)}"
        data-sale-query="${esc(item.saleSearchQuery)}"
      >
        <div class="inv-browse-item-main">
          <span class="inv-browse-name">#${esc(item.itemNumber)} · ${esc(item.style)}</span>
          <span class="inv-browse-meta muted small">${esc(item.vendor)} · ${esc(item.color)} · size ${esc(item.size)}</span>
        </div>
        <div class="inv-browse-item-actions row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-fill-search title="Fill panel search fields with this item">
            Search
          </button>
          ${
            onOrder
              ? `<button type="button" class="btn btn-add-to-order btn-sm" data-apply="${esc(item.saleSearchQuery)}" title="Search BridalLive sale by item #">
            <span class="btn-action-icon" aria-hidden="true">+</span> Add to order
          </button>`
              : ''
          }
        </div>
      </li>`,
      )
      .join('')

    pageLabel.textContent = `Page ${browsePage} of ${totalPages}`
    prevBtn.disabled = browsePage <= 1
    nextBtn.disabled = browsePage >= totalPages
    wireResultActions(list)
    wireFillSearch(list)
  }

  async function loadCatalogBrowse(): Promise<void> {
    const res = await sendToContent({ type: MSG.INVENTORY_LIST_CATALOG })
    if (res.ok && res.catalogItems?.length) {
      catalogItems = res.catalogItems
      browsePage = 1
      renderBrowseList()
    } else {
      const list = section.querySelector('#blh-inv-browse-list') as HTMLElement
      list.innerHTML = `<li class="error inv-browse-empty">${esc(res.error ?? 'Could not load catalog')}</li>`
    }
  }

  function wireFillSearch(container: HTMLElement): void {
    container.querySelectorAll('[data-fill-search]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-item]') as HTMLElement
        if (!row) return
        const item = itemRowDataset(row)
        const set = (name: string, value: string) => {
          const input = searchForm.elements.namedItem(name) as HTMLInputElement | null
          if (input) input.value = value
        }
        set('itemNumber', item.itemNumber)
        set('style', item.style)
        set('vendor', item.vendor)
        set('size', item.size)
        set('color', item.color)
        searchForm.requestSubmit()
      })
    })
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
        const row = btn.closest('tr, .inv-browse-item') as HTMLElement
        if (!row) return
        openAddVariantModal(itemRowDataset(row))
      })
    })
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const stored = await chrome.storage.local.get('mockStoreId')
    currentStoreId = String(stored.mockStoreId ?? 'store-1')

    const fd = new FormData(searchForm)
    const res = await sendToContent({
      type: MSG.INVENTORY_SEARCH,
      query: {
        style: String(fd.get('style') ?? ''),
        vendor: String(fd.get('vendor') ?? ''),
        size: String(fd.get('size') ?? ''),
        color: String(fd.get('color') ?? ''),
        itemNumber: String(fd.get('itemNumber') ?? ''),
      },
    })

    const results = section.querySelector('#blh-inv-results') as HTMLElement
    statusEl.textContent = ''
    statusEl.className = 'status'

    if (!res.ok || !res.search) {
      results.innerHTML = `<p class="error">${esc(res.error ?? 'Search failed')}</p>`
      return
    }

    if (res.search.duplicateWarning) {
      showDuplicateModal(res.search.duplicateWarning)
    }

    if (res.search.items.length === 0) {
      results.innerHTML =
        '<p class="muted">No matches across your locations. Try fewer filters or a different style name.</p>'
      return
    }

    const onOrder = getPanelContext()?.screen === 'order'

    results.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Item #</th>
            <th>BL name</th>
            <th>Size</th>
            <th>Color</th>
            <th>Location</th>
            <th>On hand</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${res.search.items
            .map(
              (item) => `
            <tr
              data-item="${esc(item.itemNumber)}"
              data-style="${esc(item.style)}"
              data-vendor="${esc(item.vendor)}"
              data-department="${esc(item.department)}"
              data-size="${esc(item.size)}"
              data-color="${esc(item.color)}"
              data-sale-query="${esc(item.saleSearchQuery)}"
            >
              <td class="item-num-cell">${itemNumberCellHtml(item.itemNumber, esc)}</td>
              <td>${esc(item.style)}</td>
              <td>${esc(item.size)}</td>
              <td>${esc(item.color)}</td>
              <td>${locationCell(item)}</td>
              <td>${item.onHand}</td>
              <td class="row-actions">
                <button type="button" class="btn btn-add-variant btn-sm" data-add-variant title="Add another size or color for this style">
                  <span class="btn-action-icon" aria-hidden="true">+</span> Add variant
                </button>
                ${onOrder ? `<button type="button" class="btn btn-add-to-order btn-sm" data-apply="${esc(item.saleSearchQuery)}" title="Search BridalLive sale by item #">
                  <span class="btn-action-icon" aria-hidden="true">+</span> Add to order
                </button>` : ''}
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `
    wireResultActions(results)
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
    if (catalogItems.length > 0) renderBrowseList()
  }

  applyContextPrefill()
  void loadCatalogBrowse()
  document.addEventListener('blh-context-updated', onContextForBrowse)

  return () => {
    document.removeEventListener('blh-context-updated', onContextForBrowse)
    section.querySelector('.blh-modal-host')?.remove()
  }
}
