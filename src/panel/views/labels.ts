import { DEPARTMENTS } from '../../lib/config'
import { getDataSourceLabel } from '../../lib/data-source'
import { MSG } from '../../lib/messages'
import type { ReceivingVoucherLine } from '../../labels/types'
import { printLabelBatch } from '../../labels/print-batch'
import { AVERY_5160 } from '../../labels/templates'
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

export const renderLabels: ViewRender = (root) => {
  const section = document.createElement('section')
  section.className = 'view view-labels'
  const deptOptions = DEPARTMENTS.map(
    (d) => `<option value="${d}">${d}</option>`,
  ).join('')

  section.innerHTML = `
    <div id="blh-labels-context-banner" class="banner banner-info" hidden></div>
    <h2 class="view-title">Labels</h2>
    <p class="muted small">MVP: mock templates + Avery 5160 PDF. Phase 2 swaps data providers only.</p>
    <p class="muted small" id="blh-labels-source">${escapeHtml(getDataSourceLabel())}</p>

    <fieldset class="fieldset">
      <legend>Sheet start position</legend>
      <p class="muted small">Click the first empty label on your partial Avery sheet (QuickBooks-style).</p>
      <div id="blh-label-grid" class="label-grid" role="grid" aria-label="Avery label start position"></div>
      <p class="muted small">Start: row <strong id="blh-start-row">1</strong>, column <strong id="blh-start-col">1</strong></p>
    </fieldset>

    <fieldset class="fieldset">
      <legend>Templates (mock)</legend>
      <ul id="blh-label-templates" class="hint-list"></ul>
    </fieldset>

    <form id="blh-labels-form" class="form-grid">
      <label>Department
        <select name="department">${deptOptions}</select>
      </label>
      <label>Item # <input name="itemNumber" type="text" placeholder="DR-10042" autocomplete="off" /></label>
      <label>Quantity <input name="quantity" type="number" min="1" value="1" /></label>
      <button type="submit" class="btn btn-primary">Generate PDF</button>
    </form>

    <hr class="divider" />

    <h3 class="subheading">Receiving voucher</h3>
    <p class="muted small" id="blh-receiving-hint">Loading mock voucher lines…</p>
    <div id="blh-labels-receiving-actions" class="btn-row">
      <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-all">Select all</button>
      <button type="button" class="btn btn-ghost btn-sm" id="blh-receiving-select-none">Select none</button>
    </div>
    <ul id="blh-labels-receiving-list" class="receiving-lines"></ul>
    <button type="button" class="btn btn-secondary" id="blh-labels-receiving">
      Print selected lines (PDF)
    </button>

    <p id="blh-labels-status" class="status" role="status"></p>
  `

  root.appendChild(section)

  let startRow = 1
  let startCol = 1
  let receivingLines: ReceivingVoucherLine[] = []

  const statusEl = section.querySelector('#blh-labels-status') as HTMLElement
  const startRowEl = section.querySelector('#blh-start-row') as HTMLElement
  const startColEl = section.querySelector('#blh-start-col') as HTMLElement

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
      })
      grid.appendChild(cell)
    }
  }
  paintStartLabels()

  const paintBanner = () => {
    const banner = section.querySelector('#blh-labels-context-banner') as HTMLElement
    const hint = section.querySelector('#blh-receiving-hint') as HTMLElement
    const ctx = getPanelContext()
    if (ctx?.screen === 'receiving') {
      banner.hidden = false
      banner.textContent =
        'Receiving screen detected — bulk print uses mock lines until Phase 2 DOM scrape.'
      hint.textContent =
        'Mock voucher (Phase 2 will read the live receiving table on this screen).'
    } else {
      banner.hidden = true
      hint.textContent =
        'Mock voucher lines for demo. Open a receiving screen or use Dev override in Settings.'
    }
  }

  const renderReceivingList = () => {
    const list = section.querySelector('#blh-labels-receiving-list') as HTMLElement
    if (receivingLines.length === 0) {
      list.innerHTML = '<li class="muted">No lines loaded.</li>'
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
      })
    })
  }

  const setStatus = (text: string, kind: 'success' | 'error' | '') => {
    statusEl.textContent = text
    statusEl.className = kind ? `status ${kind}` : 'status'
  }

  const runPrint = async (
    items: { itemNumber: string; quantity: number; style?: string; size?: string; color?: string; department?: string }[],
    department: (typeof DEPARTMENTS)[number],
  ) => {
    if (items.length === 0) {
      setStatus('Select at least one line or enter an item #.', 'error')
      return
    }
    setStatus('Generating PDF…', '')
    try {
      const labels = await printLabelBatch({
        department,
        averyStartRow: startRow,
        averyStartColumn: startCol,
        sheetId: AVERY_5160.id,
        items,
      })
      setStatus(labels.message, labels.ok ? 'success' : 'error')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Print failed', 'error')
    }
  }

  void sendToContent({ type: MSG.LABELS_LIST_TEMPLATES }).then((res) => {
    const ul = section.querySelector('#blh-label-templates') as HTMLElement
    if (!res.ok || !res.labelTemplates?.length) {
      ul.innerHTML = '<li class="muted">No templates loaded.</li>'
      return
    }
    ul.innerHTML = res.labelTemplates
      .map((t) => `<li>${escapeHtml(t.name)} (${t.widthIn}" × ${t.heightIn}")</li>`)
      .join('')
  })

  void sendToContent({ type: MSG.LABELS_GET_RECEIVING_LINES }).then((res) => {
    if (res.ok && res.receivingLines) {
      receivingLines = res.receivingLines.map((l) => ({ ...l, selected: l.selected !== false }))
      renderReceivingList()
    }
  })

  paintBanner()
  document.addEventListener('blh-context-updated', paintBanner)

  const form = section.querySelector('#blh-labels-form') as HTMLFormElement
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const department = String(fd.get('department')) as (typeof DEPARTMENTS)[number]
    await runPrint(
      [
        {
          itemNumber: String(fd.get('itemNumber') ?? ''),
          quantity: Number(fd.get('quantity')) || 1,
        },
      ],
      department,
    )
  })

  section.querySelector('#blh-receiving-select-all')?.addEventListener('click', () => {
    receivingLines.forEach((l) => {
      l.selected = true
    })
    renderReceivingList()
  })

  section.querySelector('#blh-receiving-select-none')?.addEventListener('click', () => {
    receivingLines.forEach((l) => {
      l.selected = false
    })
    renderReceivingList()
  })

  section.querySelector('#blh-labels-receiving')?.addEventListener('click', async () => {
    const selected = receivingLines.filter((l) => l.selected !== false)
    const primaryDept =
      (selected.find((l) => l.department)?.department as (typeof DEPARTMENTS)[number]) ?? 'Dress'
    await runPrint(
      selected.map((l) => ({
        itemNumber: l.itemNumber,
        quantity: l.quantity,
        style: l.style,
        size: l.size,
        color: l.color,
        department: l.department,
      })),
      primaryDept,
    )
  })

  return () => document.removeEventListener('blh-context-updated', paintBanner)
}
