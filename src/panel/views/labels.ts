import {
  loadLabelsUiState,
  saveLabelsUiState,
  type LabelsSubTab,
} from '../../lib/labels-ui-state'
import type { LabelLineItem } from '../../api/types'
import type { ReceivingVoucherLine } from '../../labels/types'
import { printLabelBatch } from '../../labels/print-batch'
import {
  inventoryItemToLabelLine,
  lookupInventoryByItemNumber,
} from '../../labels/lookup'
import { AVERY_5160 } from '../../labels/templates'
import {
  AUTO_STYLE_LAYOUT_ID,
  autoDepartmentLayouts,
  getLabelStyleLayout,
  layoutOptionsForDropdown,
  tagPreviewUrl,
} from '../../labels/style-layouts'
import {
  getActiveBridalLiveCredentials,
  isLocationConfigured,
} from '../../lib/bridallive-credentials'
import { getWorkingLocationId } from '../../lib/helper-session'
import {
  getReceivingVoucherLines,
  listReceivingVouchers,
  type BridalLiveReceivingVoucherSummary,
} from '../../lib/bridallive-receiving'
import { getPanelContext } from '../panel-context'
import { playViewFade } from '../view-fade'
import { mountMassLabeling } from './mass-labeling'
import type { ViewRender } from '../router'

const GRID_COLS = AVERY_5160.columns
const GRID_ROWS = AVERY_5160.rows

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildStyleLayoutOptions(): string {
  const groups = new Map<string, ReturnType<typeof layoutOptionsForDropdown>>()
  for (const opt of layoutOptionsForDropdown()) {
    const list = groups.get(opt.group) ?? []
    list.push(opt)
    groups.set(opt.group, list)
  }
  return [...groups.entries()]
    .map(
      ([group, opts]) =>
        `<optgroup label="${escapeHtml(group)}">${opts
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}"${o.value === AUTO_STYLE_LAYOUT_ID ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
          )
          .join('')}</optgroup>`,
    )
    .join('')
}

export const renderLabels: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-labels'
  const styleOptions = buildStyleLayoutOptions()

  section.innerHTML = `
    <h2 class="view-title">Labels</h2>
    <p class="muted small">${escapeHtml(AVERY_5160.name)} · A print preview opens in a new tab.</p>

    <div class="labels-subnav" role="tablist" aria-label="Label tools">
      <button
        type="button"
        class="labels-subnav-btn active"
        role="tab"
        id="blh-labels-tab-receiving"
        data-subtab="receiving"
        aria-controls="blh-labels-panel-receiving"
        aria-selected="true"
      >Receiving Voucher</button>
      <button
        type="button"
        class="labels-subnav-btn"
        role="tab"
        id="blh-labels-tab-reprint"
        data-subtab="reprint"
        aria-controls="blh-labels-panel-reprint"
        aria-selected="false"
        tabindex="-1"
      >Reprint Label</button>
      <button
        type="button"
        class="labels-subnav-btn"
        role="tab"
        id="blh-labels-tab-mass"
        data-subtab="mass"
        aria-controls="blh-labels-panel-mass"
        aria-selected="false"
        tabindex="-1"
      >Mass Labeling</button>
    </div>

    <section
      class="labels-tab-panel labels-block labels-block--primary"
      id="blh-labels-panel-receiving"
      role="tabpanel"
      aria-labelledby="blh-labels-tab-receiving"
    >
      <p class="labels-lead">
        Pick the voucher, choose the lines you need, then print one label for each received piece.
      </p>
      <div id="blh-labels-context-banner" class="banner banner-info" hidden></div>
      <div class="form-grid form-grid--compact receiving-controls">
        <label>Voucher
          <select id="blh-receiving-voucher"></select>
        </label>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-refresh">Refresh vouchers</button>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-all">Select all</button>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-none">Select none</button>
      </div>
      <p class="muted small" id="blh-receiving-hint">Loading vouchers for this boutique…</p>
      <ul id="blh-labels-receiving-list" class="receiving-lines"></ul>
      <button type="button" class="btn btn-primary btn-block" id="blh-labels-receiving">
        Print selected labels
      </button>
    </section>

    <section
      class="labels-tab-panel labels-block labels-block--reprint"
      id="blh-labels-panel-reprint"
      role="tabpanel"
      aria-labelledby="blh-labels-tab-reprint"
      hidden
    >
      <p class="muted small">
        Look up an <strong>item #</strong>. Price, size, color, and barcode come from BridalLive.
      </p>
      <form id="blh-labels-reprint-form" class="form-grid form-grid--compact">
        <label>Item #
          <input
            name="itemNumber"
            type="text"
            placeholder="e.g. 49153"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label>Quantity <input name="quantity" type="number" min="1" value="1" /></label>
        <button type="submit" class="btn btn-reprint">Reprint label</button>
      </form>
    </section>

    <section
      class="labels-tab-panel"
      id="blh-labels-panel-mass"
      role="tabpanel"
      aria-labelledby="blh-labels-tab-mass"
      hidden
    ></section>

    <p id="blh-labels-status" class="status" role="status"></p>

    <div class="labels-shared">
      <fieldset class="fieldset labels-block labels-block--style">
        <legend>Label design</legend>
        <label class="label-style-picker">
          <span class="label-style-picker-label">Design</span>
          <select id="blh-label-style-layout" name="styleLayout">${styleOptions}</select>
        </label>
        <div id="blh-label-style-preview" class="label-style-preview" aria-live="polite"></div>
      </fieldset>

      <fieldset class="fieldset labels-block">
        <legend>Where to start on the sheet</legend>
        <p class="muted small">On a partly used sheet, click the first empty label. Printing fills left to right from there.</p>
        <div class="label-grid-wrap">
          <div id="blh-label-grid" class="label-grid" role="grid" aria-label="Starting label on the sheet"></div>
        </div>
        <p class="muted small label-grid-caption">Start: row <strong id="blh-start-row">1</strong>, column <strong id="blh-start-col">1</strong></p>
      </fieldset>
    </div>
  `

  root.appendChild(section)

  let startRow = 1
  let startCol = 1
  let labelStyleLayoutId = AUTO_STYLE_LAYOUT_ID
  let activeSubTab: LabelsSubTab = 'receiving'
  let receivingLines: ReceivingVoucherLine[] = []
  let selectionByItem: Record<string, boolean> = {}
  let receivingLocationId = ''
  let receivingVoucherId: number | null = null
  let receivingVouchers: BridalLiveReceivingVoucherSummary[] = []

  const statusEl = section.querySelector('#blh-labels-status') as HTMLElement
  const startRowEl = section.querySelector('#blh-start-row') as HTMLElement
  const startColEl = section.querySelector('#blh-start-col') as HTMLElement
  const reprintForm = section.querySelector('#blh-labels-reprint-form') as HTMLFormElement
  const styleSelect = section.querySelector('#blh-label-style-layout') as HTMLSelectElement
  const stylePreview = section.querySelector('#blh-label-style-preview') as HTMLElement
  const voucherSelect = section.querySelector('#blh-receiving-voucher') as HTMLSelectElement
  const receivingHint = section.querySelector('#blh-receiving-hint') as HTMLElement
  const sharedEl = section.querySelector('.labels-shared') as HTMLElement
  const massPanel = section.querySelector('#blh-labels-panel-mass') as HTMLElement
  const scrollRoot = document.getElementById('blh-view-root')
  const unmountMass = mountMassLabeling(massPanel)

  const persistUiState = () => {
    const fd = new FormData(reprintForm)
    void saveLabelsUiState({
      startRow,
      startCol,
      receivingSelected: { ...selectionByItem },
      labelStyleLayoutId,
      reprintItemNumber: String(fd.get('itemNumber') ?? ''),
      reprintQuantity: Number(fd.get('quantity')) || 1,
      receivingLocationId,
      receivingVoucherId,
      activeSubTab,
      statusText: statusEl.textContent ?? '',
      statusKind: statusEl.classList.contains('success')
        ? 'success'
        : statusEl.classList.contains('error')
          ? 'error'
          : '',
      scrollTop: scrollRoot?.scrollTop ?? 0,
    })
  }

  const layoutThumb = (layout: ReturnType<typeof getLabelStyleLayout>) => {
    if (!layout) return ''
    const src = layout.previewImage ? tagPreviewUrl(layout.previewImage) : ''
    const img = src
      ? `<img class="label-style-preview-img" src="${escapeHtml(src)}" alt="${escapeHtml(layout.name)} tag" />`
      : `<div class="label-style-preview-placeholder" aria-hidden="true"></div>`
    return `<figure class="label-style-preview-figure">${img}</figure>`
  }

  const paintStylePreview = () => {
    const selection = labelStyleLayoutId
    if (selection === AUTO_STYLE_LAYOUT_ID) {
      const thumbs = autoDepartmentLayouts().map((layout) => layoutThumb(layout)).join('')
      stylePreview.innerHTML = `
        <p class="label-style-preview-title">Label Preview</p>
        <div class="label-style-preview-thumbs">${thumbs}</div>
      `
      return
    }

    const layout = getLabelStyleLayout(selection)
    if (!layout) {
      stylePreview.innerHTML = ''
      return
    }

    const mockup = layout.previewImage
      ? `<img class="label-style-preview-img label-style-preview-img--lg" src="${escapeHtml(tagPreviewUrl(layout.previewImage))}" alt="${escapeHtml(layout.name)} tag" />`
      : ''

    stylePreview.innerHTML = `
      <p class="label-style-preview-title">Label Preview</p>
      ${mockup}
    `
  }

  const paintSubTab = (opts?: { fade?: boolean }) => {
    section.querySelectorAll<HTMLButtonElement>('.labels-subnav-btn').forEach((btn) => {
      const isActive = btn.dataset.subtab === activeSubTab
      btn.classList.toggle('active', isActive)
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false')
      btn.tabIndex = isActive ? 0 : -1
    })
    section.querySelectorAll<HTMLElement>('.labels-tab-panel').forEach((panel) => {
      const panelTab = panel.id.replace('blh-labels-panel-', '') as LabelsSubTab
      panel.hidden = panelTab !== activeSubTab
    })
    if (sharedEl) sharedEl.hidden = activeSubTab === 'mass'
    statusEl.hidden = activeSubTab === 'mass'
    if (opts?.fade) {
      const visiblePanel = section.querySelector<HTMLElement>(
        `.labels-tab-panel:not([hidden])`,
      )
      playViewFade(visiblePanel)
      playViewFade(sharedEl)
    }
  }

  const setActiveSubTab = (tab: LabelsSubTab) => {
    if (activeSubTab === tab) return
    activeSubTab = tab
    paintSubTab({ fade: true })
    persistUiState()
  }

  const paintStartLabels = () => {
    startRowEl.textContent = String(startRow)
    startColEl.textContent = String(startCol)
    section.querySelectorAll('.label-grid-cell').forEach((cell) => {
      const el = cell as HTMLElement
      const r = Number(el.dataset.row)
      const c = Number(el.dataset.col)
      el.classList.toggle('is-start', r === startRow && c === startCol)
    })
  }

  const grid = section.querySelector('#blh-label-grid') as HTMLElement
  for (let row = 1; row <= GRID_ROWS; row++) {
    for (let col = 1; col <= GRID_COLS; col++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'label-grid-cell'
      cell.dataset.row = String(row)
      cell.dataset.col = String(col)
      cell.title = `Row ${row}, column ${col}`
      cell.textContent = `${row},${col}`
      cell.addEventListener('click', () => {
        startRow = row
        startCol = col
        paintStartLabels()
        persistUiState()
      })
      grid.appendChild(cell)
    }
  }

  const applySavedUiState = async () => {
    const saved = await loadLabelsUiState()
    startRow = saved.startRow
    startCol = saved.startCol
    labelStyleLayoutId = AUTO_STYLE_LAYOUT_ID
    activeSubTab = saved.activeSubTab ?? 'receiving'
    selectionByItem = { ...saved.receivingSelected }
    receivingLocationId = saved.receivingLocationId
    receivingVoucherId = saved.receivingVoucherId
    styleSelect.value = labelStyleLayoutId
    paintSubTab()
    paintStartLabels()
    paintStylePreview()

    const itemInput = reprintForm.elements.namedItem('itemNumber') as HTMLInputElement
    const qtyInput = reprintForm.elements.namedItem('quantity') as HTMLInputElement
    if (itemInput) itemInput.value = saved.reprintItemNumber
    if (qtyInput) qtyInput.value = String(saved.reprintQuantity)

    if (saved.statusText && saved.statusKind === 'error') {
      statusEl.textContent = saved.statusText
      statusEl.className = 'status error'
    }

    if (scrollRoot && saved.scrollTop > 0) {
      scrollRoot.scrollTop = saved.scrollTop
    }
  }

  const paintBanner = () => {
    const banner = section.querySelector('#blh-labels-context-banner') as HTMLElement
    const ctx = getPanelContext()
    if (ctx?.screen === 'receiving') {
      banner.hidden = false
      banner.textContent =
        'Receiving is open in BridalLive — pick the matching voucher below to print labels.'
    } else {
      banner.hidden = true
    }
  }

  const formatVoucherOption = (v: BridalLiveReceivingVoucherSummary): string => {
    const date = v.receiveDate
      ? new Date(v.receiveDate).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : ''
    return `#${v.number} · ${v.vendorName}${date ? ` · ${date}` : ''} · ${v.status}`
  }

  const renderVoucherSelect = () => {
    if (receivingVouchers.length === 0) {
      voucherSelect.innerHTML = '<option value="">No vouchers found</option>'
      voucherSelect.disabled = true
      return
    }
    voucherSelect.disabled = false
    voucherSelect.innerHTML = receivingVouchers
      .map(
        (v) =>
          `<option value="${v.id}">${escapeHtml(formatVoucherOption(v))}</option>`,
      )
      .join('')
    if (
      receivingVoucherId != null &&
      receivingVouchers.some((v) => v.id === receivingVoucherId)
    ) {
      voucherSelect.value = String(receivingVoucherId)
    } else {
      receivingVoucherId = receivingVouchers[0]!.id
      voucherSelect.value = String(receivingVoucherId)
    }
  }

  const loadWorkingLocation = async () => {
    receivingLocationId = await getWorkingLocationId()
    const creds = await getActiveBridalLiveCredentials()
    if (!creds || !isLocationConfigured(creds.location)) {
      voucherSelect.innerHTML = '<option value="">—</option>'
      voucherSelect.disabled = true
      receivingHint.textContent =
        'Sign in on Home and pick your working location. The Helper server supplies this boutique’s BridalLive keys.'
      return false
    }
    return true
  }

  const loadVoucherLines = async () => {
    if (receivingVoucherId == null || !receivingLocationId) {
      receivingLines = []
      renderReceivingList()
      receivingHint.textContent = 'Select a voucher to load lines.'
      return
    }

      receivingHint.textContent = 'Loading voucher lines…'
    try {
      const lines = await getReceivingVoucherLines(
        receivingVoucherId,
        receivingLocationId,
      )
      receivingLines = lines.map((l) => ({
        ...l,
        selected: selectionByItem[l.itemNumber] !== false,
      }))
      syncSelectionMap()
      renderReceivingList()
      const voucher = receivingVouchers.find((v) => v.id === receivingVoucherId)
      receivingHint.textContent = receivingLines.length
        ? `${receivingLines.length} line(s) on voucher #${voucher?.number ?? receivingVoucherId}${voucher ? ` · ${voucher.locationName}` : ''}.`
        : `Voucher #${voucher?.number ?? receivingVoucherId} has no line items.`
      persistUiState()
    } catch (err) {
      receivingLines = []
      renderReceivingList()
      receivingHint.textContent =
        err instanceof Error ? err.message : 'Could not load voucher lines.'
    }
  }

  const loadVouchersForLocation = async () => {
    if (!receivingLocationId) return
    receivingHint.textContent = 'Loading receiving vouchers…'
    voucherSelect.disabled = true
    try {
      receivingVouchers = await listReceivingVouchers(receivingLocationId)
      renderVoucherSelect()
      if (receivingVouchers.length === 0) {
        receivingLines = []
        renderReceivingList()
        receivingHint.textContent = `No receiving vouchers found for this location.`
        persistUiState()
        return
      }
      await loadVoucherLines()
    } catch (err) {
      receivingVouchers = []
      renderVoucherSelect()
      receivingLines = []
      renderReceivingList()
      receivingHint.textContent =
        err instanceof Error ? err.message : 'Could not load receiving vouchers.'
    }
  }

  const syncSelectionMap = () => {
    for (const line of receivingLines) {
      selectionByItem[line.itemNumber] = line.selected !== false
    }
  }

  const renderReceivingList = () => {
    const list = section.querySelector('#blh-labels-receiving-list') as HTMLElement
    if (receivingLines.length === 0) {
      list.innerHTML = '<li class="muted receiving-line-empty">No lines on this voucher.</li>'
      return
    }
    list.innerHTML = receivingLines
      .map(
        (line, idx) => `
      <li class="receiving-line">
        <label>
          <input type="checkbox" data-idx="${idx}" ${line.selected !== false ? 'checked' : ''} />
          <span>
            <code>${escapeHtml(line.itemNumber)}</code>
            × ${line.quantity}
            ${line.style ? ` — ${escapeHtml(line.style)}` : ''}
            ${line.size || line.color ? ` · ${escapeHtml(line.size || '—')} / ${escapeHtml(line.color || '—')}` : ''}
            ${line.department ? `<span class="tag">${escapeHtml(line.department)}</span>` : ''}
          </span>
        </label>
      </li>`,
      )
      .join('')

    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const idx = Number((cb as HTMLInputElement).dataset.idx)
        receivingLines[idx].selected = (cb as HTMLInputElement).checked
        syncSelectionMap()
        persistUiState()
      })
    })
  }

  const setStatus = (text: string, kind: 'success' | 'error' | '') => {
    statusEl.textContent = text
    statusEl.className = kind ? `status ${kind}` : 'status'
    persistUiState()
  }

  const reprintFallbackDepartment = () => {
    const layout = getLabelStyleLayout(labelStyleLayoutId)
    return layout?.department ?? 'Dress'
  }

  const runPrint = async (items: LabelLineItem[], emptyMessage: string) => {
    if (items.length === 0) {
      setStatus(emptyMessage, 'error')
      return
    }
    persistUiState()
    setStatus('Preparing labels…', '')
    try {
      const result = await printLabelBatch({
        styleLayoutId: labelStyleLayoutId,
        averyStartRow: startRow,
        averyStartColumn: startCol,
        sheetId: AVERY_5160.id,
        items,
        fallbackDepartment: reprintFallbackDepartment(),
      })
      setStatus(result.ok ? '' : result.message, result.ok ? '' : 'error')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not print these labels', 'error')
    }
  }

  styleSelect.addEventListener('change', () => {
    labelStyleLayoutId = styleSelect.value
    paintStylePreview()
    persistUiState()
  })

  section.querySelectorAll<HTMLButtonElement>('.labels-subnav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subtab as LabelsSubTab | undefined
      if (tab) setActiveSubTab(tab)
    })
  })

  void (async () => {
    await applySavedUiState()
    paintBanner()
    const ok = await loadWorkingLocation()
    if (ok) await loadVouchersForLocation()
  })()

  paintBanner()
  document.addEventListener('blh-context-updated', paintBanner)

  voucherSelect.addEventListener('change', () => {
    const id = Number(voucherSelect.value)
    receivingVoucherId = Number.isFinite(id) ? id : null
    selectionByItem = {}
    void loadVoucherLines()
  })

  section.querySelector('#blh-receiving-refresh')?.addEventListener('click', () => {
    void loadVouchersForLocation()
  })

  reprintForm.addEventListener('input', () => persistUiState())
  const onScroll = () => persistUiState()
  scrollRoot?.addEventListener('scroll', onScroll, { passive: true })
  reprintForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(reprintForm)
    const itemNumber = String(fd.get('itemNumber') ?? '').trim()
    const quantity = Number(fd.get('quantity')) || 1

    if (!itemNumber) {
      setStatus('Enter an item # to reprint.', 'error')
      return
    }

    const creds = await getActiveBridalLiveCredentials()
    if (!creds) {
      setStatus(
        'Sign in on Home and pick your working location before reprinting labels.',
        'error',
      )
      return
    }

    setStatus(`Looking up item #${itemNumber}…`, '')
    try {
      const storeId = receivingLocationId || creds.location.id
      const match = await lookupInventoryByItemNumber(itemNumber, storeId)
      if (!match) {
        setStatus(
          `No item #${itemNumber} found at this location.`,
          'error',
        )
        return
      }

      await runPrint(
        [inventoryItemToLabelLine(match, quantity)],
        'Enter an item # to reprint.',
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not look up that item', 'error')
    }
  })

  section.querySelector('#blh-receiving-select-all')?.addEventListener('click', () => {
    receivingLines.forEach((l) => {
      l.selected = true
    })
    syncSelectionMap()
    renderReceivingList()
    persistUiState()
  })

  section.querySelector('#blh-receiving-select-none')?.addEventListener('click', () => {
    receivingLines.forEach((l) => {
      l.selected = false
    })
    syncSelectionMap()
    renderReceivingList()
    persistUiState()
  })

  section.querySelector('#blh-labels-receiving')?.addEventListener('click', async () => {
    const selected = receivingLines.filter((l) => l.selected !== false)
    await runPrint(
      selected.map((l) => ({
        itemNumber: l.itemNumber,
        quantity: l.quantity,
        style: l.style,
        size: l.size,
        color: l.color,
        department: l.department,
        vendorItemName: l.vendorItemName,
      })),
      'Select at least one line to print.',
    )
  })

  return () => {
    document.removeEventListener('blh-context-updated', paintBanner)
    scrollRoot?.removeEventListener('scroll', onScroll)
    unmountMass()
  }
}
