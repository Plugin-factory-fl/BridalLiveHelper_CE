import { MSG } from '../../lib/messages'
import { getPanelContext } from '../panel-context'
import { sendToContent } from '../bridge-client'
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

function prefillVariantFromOrder(form: HTMLFormElement, ctx: BridalLiveContext): void {
  const line = ctx.orderLine
  if (!line) return
  const set = (name: string, value?: string) => {
    if (!value) return
    const input = form.elements.namedItem(name) as HTMLInputElement | null
    if (input && !input.value.trim()) input.value = value
  }
  set('styleId', line.style)
  set('size', line.size)
  set('color', line.color)
  if (line.itemNumber) set('sourceItemNumber', line.itemNumber)
}

export const renderInventory: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-inventory'
  section.innerHTML = `
    <div id="blh-inv-order-banner" class="banner banner-info" hidden></div>
    <h2 class="view-title">Inventory</h2>
    <p class="muted">Search by style, vendor, size, color, or item #. Duplicate style+size+color is flagged before you create a variant.</p>
    <form id="blh-inv-search" class="form-grid">
      <label>Style <input name="style" type="text" placeholder="Iris" autocomplete="off" /></label>
      <label>Vendor <input name="vendor" type="text" autocomplete="off" /></label>
      <label>Size <input name="size" type="text" placeholder="10" autocomplete="off" /></label>
      <label>Color <input name="color" type="text" placeholder="Light Pink" autocomplete="off" /></label>
      <label>Item # <input name="itemNumber" type="text" autocomplete="off" /></label>
      <button type="submit" class="btn btn-primary">Search</button>
    </form>
    <div id="blh-inv-warning" class="banner banner-warn" hidden></div>
    <div id="blh-inv-results" class="results"></div>
    <hr />
    <h3 class="subheading">Add variant</h3>
    <form id="blh-inv-variant" class="form-grid">
      <label>Style <input name="styleId" type="text" required autocomplete="off" /></label>
      <label>Size <input name="size" type="text" required autocomplete="off" /></label>
      <label>Color <input name="color" type="text" required autocomplete="off" /></label>
      <label>Duplicate from item # <input name="sourceItemNumber" type="text" placeholder="Optional" autocomplete="off" /></label>
      <button type="submit" class="btn btn-secondary">Add size / color</button>
    </form>
    <div id="blh-inv-variant-dup" class="banner banner-warn" hidden></div>
    <p id="blh-inv-variant-msg" class="status" role="status"></p>
  `

  root.appendChild(section)

  const searchForm = section.querySelector('#blh-inv-search') as HTMLFormElement
  const variantForm = section.querySelector('#blh-inv-variant') as HTMLFormElement
  const orderBanner = section.querySelector('#blh-inv-order-banner') as HTMLElement
  const variantDup = section.querySelector('#blh-inv-variant-dup') as HTMLElement

  let duplicateTimer: ReturnType<typeof setTimeout> | undefined

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
        'Order screen — open Inventory here while you work the order. Configure order selectors to prefill from the active line.'
    }
  }

  const applyContextPrefill = () => {
    const ctx = getPanelContext()
    if (!ctx) return
    prefillSearchFromOrder(searchForm, ctx)
    prefillVariantFromOrder(variantForm, ctx)
    paintOrderBanner()
  }

  const runDuplicateCheck = () => {
    const fd = new FormData(variantForm)
    const styleId = String(fd.get('styleId') ?? '').trim()
    const size = String(fd.get('size') ?? '').trim()
    const color = String(fd.get('color') ?? '').trim()
    if (!styleId || !size || !color) {
      variantDup.hidden = true
      return
    }
    void sendToContent({
      type: MSG.INVENTORY_CHECK_DUPLICATE,
      styleId,
      size,
      color,
    }).then((res) => {
      if (res.search?.duplicateWarning) {
        variantDup.hidden = false
        variantDup.textContent = res.search.duplicateWarning
      } else {
        variantDup.hidden = true
      }
    })
  }

  const scheduleDuplicateCheck = () => {
    clearTimeout(duplicateTimer)
    duplicateTimer = setTimeout(runDuplicateCheck, 350)
  }

  variantForm.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', scheduleDuplicateCheck)
  })

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault()
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
    const warning = section.querySelector('#blh-inv-warning') as HTMLElement
    const results = section.querySelector('#blh-inv-results') as HTMLElement
    if (!res.ok || !res.search) {
      results.innerHTML = `<p class="error">${esc(res.error ?? 'Search failed')}</p>`
      return
    }
    if (res.search.duplicateWarning) {
      warning.hidden = false
      warning.textContent = res.search.duplicateWarning
    } else {
      warning.hidden = true
    }
    if (res.search.items.length === 0) {
      results.innerHTML = '<p class="muted">No matches. You can add a new variant below.</p>'
      return
    }
    const onOrder = getPanelContext()?.screen === 'order'
    results.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Item #</th><th>Style</th><th>Size</th><th>Color</th><th>On hand</th><th></th></tr></thead>
        <tbody>
          ${res.search.items
            .map(
              (item) => `
            <tr data-item="${esc(item.itemNumber)}" data-style="${esc(item.style)}" data-size="${esc(item.size)}" data-color="${esc(item.color)}">
              <td><code>${esc(item.itemNumber)}</code></td>
              <td>${esc(item.style)}</td>
              <td>${esc(item.size)}</td>
              <td>${esc(item.color)}</td>
              <td>${item.onHand}</td>
              <td class="row-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(item.itemNumber)}">Copy</button>
                ${onOrder ? `<button type="button" class="btn btn-ghost btn-sm" data-apply="${esc(item.itemNumber)}">To order</button>` : ''}
                <button type="button" class="btn btn-ghost btn-sm" data-source="${esc(item.itemNumber)}">Use as source</button>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `
    results.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const num = (btn as HTMLElement).dataset.copy
        if (num) void sendToContent({ type: MSG.COPY_TO_CLIPBOARD, text: num })
      })
    })
    results.querySelectorAll('[data-apply]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const num = (btn as HTMLElement).dataset.apply
        if (!num) return
        const res = await sendToContent({ type: MSG.APPLY_ITEM_TO_ORDER, itemNumber: num })
        const status = section.querySelector('#blh-inv-variant-msg') as HTMLElement
        if (res.ok) {
          status.textContent = `Applied ${num} to order line.`
          status.className = 'status success'
        } else {
          status.textContent = res.error ?? 'Could not apply to order'
          status.className = 'status error'
        }
      })
    })
    results.querySelectorAll('[data-source]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr') as HTMLElement
        if (!row) return
        const styleId = row.dataset.style ?? ''
        const size = row.dataset.size ?? ''
        const color = row.dataset.color ?? ''
        const source = row.dataset.item ?? ''
        ;(variantForm.elements.namedItem('styleId') as HTMLInputElement).value = styleId
        ;(variantForm.elements.namedItem('size') as HTMLInputElement).value = size
        ;(variantForm.elements.namedItem('color') as HTMLInputElement).value = color
        ;(variantForm.elements.namedItem('sourceItemNumber') as HTMLInputElement).value = source
        scheduleDuplicateCheck()
        variantForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    })
  })

  variantForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(variantForm)
    const msg = section.querySelector('#blh-inv-variant-msg') as HTMLElement
    const res = await sendToContent({
      type: MSG.INVENTORY_CREATE_VARIANT,
      payload: {
        styleId: String(fd.get('styleId') ?? ''),
        size: String(fd.get('size') ?? ''),
        color: String(fd.get('color') ?? ''),
        sourceItemNumber: String(fd.get('sourceItemNumber') ?? '') || undefined,
      },
    })
    if (!res.ok || !res.variant) {
      msg.textContent = res.error ?? 'Failed'
      msg.className = 'status error'
      return
    }
    msg.textContent = res.variant.message
    msg.className = res.variant.ok ? 'status success' : 'status error'
    if (res.variant.ok && res.variant.itemNumber && getPanelContext()?.screen === 'order') {
      const apply = await sendToContent({
        type: MSG.APPLY_ITEM_TO_ORDER,
        itemNumber: res.variant.itemNumber,
      })
      if (apply.ok) {
        msg.textContent += ' Applied to order line.'
      }
    }
  })

  applyContextPrefill()
  const onContext = () => applyContextPrefill()
  document.addEventListener('blh-context-updated', onContext)

  return () => {
    document.removeEventListener('blh-context-updated', onContext)
    clearTimeout(duplicateTimer)
  }
}
