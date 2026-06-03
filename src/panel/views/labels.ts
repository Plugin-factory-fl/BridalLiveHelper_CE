import { loadLabelsUiState, saveLabelsUiState } from '../../lib/labels-ui-state'
import { MSG } from '../../lib/messages'
import type { LabelLineItem } from '../../api/types'
import type { ReceivingVoucherLine } from '../../labels/types'
import { printLabelBatch } from '../../labels/print-batch'
import { AVERY_5160 } from '../../labels/templates'
import {
  AUTO_STYLE_LAYOUT_ID,
  describeLayoutSelection,
  getLabelStyleLayout,
  layoutOptionsForDropdown,
} from '../../labels/style-layouts'
import { getPanelContext } from '../panel-context'
import { sendToContent } from '../bridge-client'
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
              `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`,
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
    <p class="muted small">${escapeHtml(AVERY_5160.name)} · PDF opens in a print-preview tab.</p>

    <fieldset class="fieldset labels-block labels-block--style">
      <legend>Label style layout</legend>
      <label class="label-style-picker">
        <span class="label-style-picker-label">Design</span>
        <select id="blh-label-style-layout" name="styleLayout">${styleOptions}</select>
      </label>
      <div id="blh-label-style-preview" class="label-style-preview" aria-live="polite"></div>
    </fieldset>

    <fieldset class="fieldset labels-block">
      <legend>Sheet start position</legend>
      <p class="muted small">On a partially used sheet, click the first empty label. Printing fills left-to-right from there.</p>
      <div class="label-grid-wrap">
        <div id="blh-label-grid" class="label-grid" role="grid" aria-label="Avery label start position"></div>
      </div>
      <p class="muted small label-grid-caption">Start: row <strong id="blh-start-row">1</strong>, column <strong id="blh-start-col">1</strong></p>
    </fieldset>

    <section class="labels-block labels-block--primary" aria-labelledby="blh-receiving-heading">
      <div class="labels-block-header">
        <h3 class="subheading" id="blh-receiving-heading">Receiving voucher</h3>
        <span class="labels-badge labels-badge--primary">Main workflow</span>
      </div>
      <p class="labels-lead">Select lines on the voucher and bulk-print labels — one label per received quantity. Each line uses its own department when Auto layout is selected.</p>
      <div id="blh-labels-context-banner" class="banner banner-info" hidden></div>
      <p class="muted small" id="blh-receiving-hint">Loading voucher lines…</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-all">Select all</button>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-none">Select none</button>
      </div>
      <ul id="blh-labels-receiving-list" class="receiving-lines"></ul>
      <button type="button" class="btn btn-primary btn-block" id="blh-labels-receiving">
        Print selected lines (PDF)
      </button>
    </section>

    <section class="labels-block labels-block--reprint" aria-labelledby="blh-reprint-heading">
      <h3 class="subheading" id="blh-reprint-heading">Reprint label</h3>
      <p class="muted small">One-off reprint when a tag was torn off. Department is inferred from the item # when using Auto layout.</p>
      <form id="blh-labels-reprint-form" class="form-grid form-grid--compact">
        <label>Item # <input name="itemNumber" type="text" placeholder="DR-10042" autocomplete="off" /></label>
        <label>Quantity <input name="quantity" type="number" min="1" value="1" /></label>
        <button type="submit" class="btn btn-reprint">Reprint (PDF)</button>
      </form>
    </section>

    <p id="blh-labels-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  let startRow = 1
  let startCol = 1
  let labelStyleLayoutId = AUTO_STYLE_LAYOUT_ID
  let receivingLines: ReceivingVoucherLine[] = []
  let selectionByItem: Record<string, boolean> = {}

  const statusEl = section.querySelector('#blh-labels-status') as HTMLElement
  const startRowEl = section.querySelector('#blh-start-row') as HTMLElement
  const startColEl = section.querySelector('#blh-start-col') as HTMLElement
  const reprintForm = section.querySelector('#blh-labels-reprint-form') as HTMLFormElement
  const styleSelect = section.querySelector('#blh-label-style-layout') as HTMLSelectElement
  const stylePreview = section.querySelector('#blh-label-style-preview') as HTMLElement
  const scrollRoot = document.getElementById('blh-view-root')

  const persistUiState = () => {
    const fd = new FormData(reprintForm)
    void saveLabelsUiState({
      startRow,
      startCol,
      receivingSelected: { ...selectionByItem },
      labelStyleLayoutId,
      reprintItemNumber: String(fd.get('itemNumber') ?? ''),
      reprintQuantity: Number(fd.get('quantity')) || 1,
      statusText: statusEl.textContent ?? '',
      statusKind: statusEl.classList.contains('success')
        ? 'success'
        : statusEl.classList.contains('error')
          ? 'error'
          : '',
      scrollTop: scrollRoot?.scrollTop ?? 0,
    })
  }

  const paintStylePreview = () => {
    const selection = labelStyleLayoutId
    if (selection === AUTO_STYLE_LAYOUT_ID) {
      stylePreview.innerHTML = `
        <p class="label-style-preview-title">Auto by department</p>
        <p class="label-style-preview-desc">${escapeHtml(describeLayoutSelection(selection))}</p>
        <ul class="label-style-preview-fields">
          <li>Dress → Dress — Classic tag</li>
          <li>Shoes → Shoes — Standard</li>
          <li>Jewelry → Jewelry — Standard</li>
        </ul>
        <p class="label-style-preview-note muted small">Best for mixed receiving vouchers.</p>
      `
      return
    }

    const layout = getLabelStyleLayout(selection)
    if (!layout) {
      stylePreview.innerHTML = ''
      return
    }

    const statusBadge =
      layout.status === 'placeholder'
        ? '<span class="label-style-preview-badge">Placeholder — swap when client design arrives</span>'
        : '<span class="label-style-preview-badge label-style-preview-badge--client">Client design</span>'

    stylePreview.innerHTML = `
      <div class="label-style-preview-header">
        <p class="label-style-preview-title">${escapeHtml(layout.name)}</p>
        <span class="tag">${escapeHtml(layout.department)}</span>
      </div>
      ${statusBadge}
      <p class="label-style-preview-desc">${escapeHtml(layout.description)}</p>
      <p class="label-style-preview-fields-label">Fields on label</p>
      <ul class="label-style-preview-fields">
        ${layout.fields.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>
    `
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
    labelStyleLayoutId = saved.labelStyleLayoutId ?? AUTO_STYLE_LAYOUT_ID
    selectionByItem = { ...saved.receivingSelected }
    styleSelect.value = labelStyleLayoutId
    paintStartLabels()
    paintStylePreview()

    const itemInput = reprintForm.elements.namedItem('itemNumber') as HTMLInputElement
    const qtyInput = reprintForm.elements.namedItem('quantity') as HTMLInputElement
    if (itemInput) itemInput.value = saved.reprintItemNumber
    if (qtyInput) qtyInput.value = String(saved.reprintQuantity)

    if (saved.statusText) {
      statusEl.textContent = saved.statusText
      statusEl.className = saved.statusKind ? `status ${saved.statusKind}` : 'status'
    }

    if (scrollRoot && saved.scrollTop > 0) {
      scrollRoot.scrollTop = saved.scrollTop
    }

    if (receivingLines.length > 0) {
      receivingLines = receivingLines.map((line) => ({
        ...line,
        selected: selectionByItem[line.itemNumber] !== false,
      }))
      renderReceivingList()
    }
  }

  const paintBanner = () => {
    const banner = section.querySelector('#blh-labels-context-banner') as HTMLElement
    const hint = section.querySelector('#blh-receiving-hint') as HTMLElement
    const ctx = getPanelContext()
    if (ctx?.screen === 'receiving') {
      banner.hidden = false
      banner.textContent =
        'Receiving screen open — Phase 2 will load lines from this voucher automatically.'
      hint.textContent = 'Lines below are mock data until live scrape is wired.'
    } else {
      banner.hidden = true
      hint.textContent =
        'Open a receiving voucher in BridalLive (or Settings → Dev override → Receiving) for the full flow.'
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
      list.innerHTML = '<li class="muted receiving-line-empty">No lines loaded.</li>'
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
    setStatus('Generating PDF…', '')
    try {
      const result = await printLabelBatch({
        styleLayoutId: labelStyleLayoutId,
        averyStartRow: startRow,
        averyStartColumn: startCol,
        sheetId: AVERY_5160.id,
        items,
        fallbackDepartment: reprintFallbackDepartment(),
      })
      setStatus(result.message, result.ok ? 'success' : 'error')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Print failed', 'error')
    }
  }

  styleSelect.addEventListener('change', () => {
    labelStyleLayoutId = styleSelect.value
    paintStylePreview()
    persistUiState()
  })

  void (async () => {
    await applySavedUiState()

    const res = await sendToContent({ type: MSG.LABELS_GET_RECEIVING_LINES })
    if (res.ok && res.receivingLines) {
      receivingLines = res.receivingLines.map((l) => ({
        ...l,
        selected: selectionByItem[l.itemNumber] !== false,
      }))
      syncSelectionMap()
      renderReceivingList()
    }
  })()

  paintBanner()
  document.addEventListener('blh-context-updated', paintBanner)

  reprintForm.addEventListener('input', () => persistUiState())
  const onScroll = () => persistUiState()
  scrollRoot?.addEventListener('scroll', onScroll, { passive: true })
  reprintForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(reprintForm)
    await runPrint(
      [
        {
          itemNumber: String(fd.get('itemNumber') ?? ''),
          quantity: Number(fd.get('quantity')) || 1,
        },
      ],
      'Enter an item # to reprint.',
    )
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
      })),
      'Select at least one receiving line.',
    )
  })

  return () => {
    document.removeEventListener('blh-context-updated', paintBanner)
    scrollRoot?.removeEventListener('scroll', onScroll)
  }
}
