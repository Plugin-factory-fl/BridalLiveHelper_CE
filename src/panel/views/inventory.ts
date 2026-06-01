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
    <div id="blh-inv-results" class="results"></div>
    <p id="blh-inv-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  const searchForm = section.querySelector('#blh-inv-search') as HTMLFormElement
  const orderBanner = section.querySelector('#blh-inv-order-banner') as HTMLElement
  const statusEl = section.querySelector('#blh-inv-status') as HTMLElement

  let currentStoreId = 'store-1'

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

      if (res.variant.itemNumber && getPanelContext()?.screen === 'order') {
        const apply = await sendToContent({
          type: MSG.APPLY_ITEM_TO_ORDER,
          itemNumber: res.variant.itemNumber,
        })
        if (apply.ok) {
          statusEl.textContent += ' Applied to order line.'
        }
      }

      searchForm.requestSubmit()
    })
  }

  function wireResultActions(results: HTMLElement): void {
    wireCopyItemButtons(results)

    results.querySelectorAll('[data-apply]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const num = (btn as HTMLElement).dataset.apply
        if (!num) return
        const res = await sendToContent({ type: MSG.APPLY_ITEM_TO_ORDER, itemNumber: num })
        if (res.ok) {
          statusEl.textContent = `Applied ${num} to order line.`
          statusEl.className = 'status success'
        } else {
          statusEl.textContent = res.error ?? 'Could not apply to order'
          statusEl.className = 'status error'
        }
      })
    })

    results.querySelectorAll('[data-add-variant]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr') as HTMLElement
        if (!row) return
        openAddVariantModal({
          itemNumber: row.dataset.item ?? '',
          style: row.dataset.style ?? '',
          vendor: row.dataset.vendor ?? '',
          department: row.dataset.department ?? '',
          size: row.dataset.size ?? '',
          color: row.dataset.color ?? '',
        })
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
            <th>Style</th>
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
                ${onOrder ? `<button type="button" class="btn btn-add-to-order btn-sm" data-apply="${esc(item.itemNumber)}" title="Add this item to the order line">
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

  applyContextPrefill()
  document.addEventListener('blh-context-updated', applyContextPrefill)

  return () => {
    document.removeEventListener('blh-context-updated', applyContextPrefill)
    section.querySelector('.blh-modal-host')?.remove()
  }
}
