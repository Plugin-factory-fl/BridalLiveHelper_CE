import { expandMassSelectedRows, formatMassMoney, rowToMassPayload } from '../../labels/mass-expand'
import { buildMassLabelPdf } from '../../labels/mass-pdf'
import { clampRange, pageCountForLabels } from '../../labels/layout'
import { openPdfInNewTab } from '../../labels/pdf'
import { parseSpreadsheet } from '../../labels/spreadsheet/parse'
import type { SpreadsheetInventoryRow, SpreadsheetParseResult } from '../../labels/spreadsheet/types'
import { AVERY_5160 } from '../../labels/templates'

const sheet = AVERY_5160

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function mountMassLabeling(host: HTMLElement): () => void {
  host.innerHTML = `
    <div class="mass-labeling">
    <p class="labels-lead">
      Upload a BridalLive inventory spreadsheet, choose the first and last label on a partly used sheet, then print.
    </p>
    <form id="blh-mass-upload-form" class="mass-upload">
      <label class="mass-dropzone" id="blh-mass-dropzone">
        <input
          id="blh-mass-file"
          name="spreadsheet"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
        <span class="mass-drop-icon" aria-hidden="true"></span>
        <span class="mass-drop-title" id="blh-mass-drop-title">Drop your spreadsheet here</span>
        <span class="muted small">.xlsx or .csv from BridalLive</span>
        <span class="mass-choose">Choose file</span>
      </label>
    </form>
    <p class="status" id="blh-mass-upload-status" role="status"></p>
    <p class="muted small mass-sample-hint">
      <button type="button" class="btn-link" id="blh-mass-sample">Try a sample file</button>
    </p>

    <div id="blh-mass-print" hidden>
      <div class="mass-toolbar">
        <p class="muted small" id="blh-mass-file-summary"></p>
        <button type="button" class="btn btn-ghost btn-sm" id="blh-mass-new-file">Use a different file</button>
      </div>

      <fieldset class="fieldset mass-card">
        <legend>Where should printing start?</legend>
        <p class="muted small">Click the first empty label, then the last one to fill on this sheet.</p>
        <div id="blh-mass-grid" class="mass-grid" role="grid" aria-label="Avery 5160 sheet"></div>
        <p class="muted small mass-grid-caption">
          From <strong id="blh-mass-start">1,1</strong> to <strong id="blh-mass-end">10,3</strong>
        </p>
      </fieldset>

      <fieldset class="fieldset mass-card">
        <legend>Items</legend>
        <div class="btn-row mass-item-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="blh-mass-select-all">Select all</button>
          <button type="button" class="btn btn-ghost btn-sm" id="blh-mass-select-none">Select none</button>
        </div>
        <label class="mass-qty-toggle">
          <input type="checkbox" id="blh-mass-copies-qty" checked />
          One label per quantity on hand
        </label>
        <ul id="blh-mass-item-list" class="mass-item-list receiving-lines"></ul>
        <p class="muted small" id="blh-mass-selection"></p>
      </fieldset>

      <div class="mass-preview-wrap">
        <div id="blh-mass-preview" class="mass-preview" aria-hidden="true"></div>
        <p class="muted small">Avery 5160 · 30 labels per sheet. Print at 100% — do not use Fit to page.</p>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="blh-mass-print-btn">Print labels</button>
      <p class="status" id="blh-mass-print-status" role="status"></p>
    </div>
    </div>
  `

  const state = {
    parse: null as SpreadsheetParseResult | null,
    startRow: 1,
    startCol: 1,
    endRow: sheet.rows,
    endCol: sheet.columns,
    picking: 'start' as 'start' | 'end',
    copiesFromQty: true,
  }

  const $ = (id: string): HTMLElement => {
    const el = host.querySelector(`#${id}`)
    if (!el) throw new Error(`Missing #${id}`)
    return el as HTMLElement
  }

  const setStatus = (id: string, text: string, kind: '' | 'success' | 'error' = '') => {
    const el = $(id)
    el.textContent = text
    el.className = kind ? `status ${kind}` : 'status'
  }

  const selectedRows = (): SpreadsheetInventoryRow[] =>
    state.parse?.rows.filter((row) => row.selected) ?? []

  const labelCount = () => expandMassSelectedRows(selectedRows(), state.copiesFromQty).length

  const currentRange = () =>
    clampRange(sheet, state.startRow, state.startCol, state.endRow, state.endCol)

  const paintGrid = () => {
    const range = currentRange()
    state.startRow = range.startRow
    state.startCol = range.startCol
    state.endRow = range.endRow
    state.endCol = range.endCol
    $('blh-mass-start').textContent = `${range.startRow},${range.startCol}`
    $('blh-mass-end').textContent = `${range.endRow},${range.endCol}`

    $('blh-mass-grid')
      .querySelectorAll<HTMLButtonElement>('.mass-grid-cell')
      .forEach((cell) => {
        const index = Number(cell.dataset.index)
        cell.classList.toggle('is-range', index >= range.startIndex && index <= range.endIndex)
        cell.classList.toggle('is-start', index === range.startIndex)
        cell.classList.toggle('is-end', index === range.endIndex)
      })
  }

  const buildGrid = () => {
    const grid = $('blh-mass-grid')
    grid.replaceChildren()
    for (let row = 1; row <= sheet.rows; row++) {
      for (let col = 1; col <= sheet.columns; col++) {
        const cell = document.createElement('button')
        cell.type = 'button'
        cell.className = 'mass-grid-cell'
        cell.dataset.index = String((row - 1) * sheet.columns + (col - 1))
        cell.title = `Row ${row}, column ${col}`
        cell.textContent = `${row},${col}`
        cell.addEventListener('click', () => {
          if (state.picking === 'start') {
            state.startRow = row
            state.startCol = col
            state.picking = 'end'
          } else {
            state.endRow = row
            state.endCol = col
            state.picking = 'start'
          }
          paintGrid()
          paintSelectionSummary()
        })
        grid.appendChild(cell)
      }
    }
    paintGrid()
  }

  const paintPreview = () => {
    const preview = $('blh-mass-preview')
    const row = selectedRows()[0] ?? state.parse?.rows[0]
    if (!row) {
      preview.replaceChildren()
      return
    }
    const label = rowToMassPayload(row)
    preview.innerHTML = `
      <div class="mass-preview-copy">
        <div>${escapeHtml(label.itemName)}</div>
        <div class="mass-preview-split"><span>${escapeHtml(label.deptCode)}</span><span>${escapeHtml(label.vendorCode)}</span></div>
        <div>${escapeHtml(label.color)}</div>
        <div class="mass-preview-split"><span>${escapeHtml(label.size)}</span><span>${escapeHtml(label.salePrice)}</span></div>
        <div class="mass-preview-orig">${escapeHtml(label.origPrice)}</div>
      </div>
      <div class="mass-preview-code">
        <div class="mass-preview-barcode"></div>
      </div>
    `
  }

  const paintItemList = () => {
    const list = $('blh-mass-item-list')
    const rows = state.parse?.rows ?? []
    if (!rows.length) {
      list.innerHTML = '<li class="muted receiving-line-empty">No items found in this file.</li>'
      return
    }

    list.innerHTML = rows
      .map((row) => {
        const detail = [row.size, row.color].filter(Boolean).join(' · ')
        return `
          <li class="receiving-line">
            <label>
              <input type="checkbox" data-id="${row.id}" ${row.selected ? 'checked' : ''} />
              <span>
                <span class="mass-item-id">${escapeHtml(row.itemNumber || row.itemName)}</span>
                <span class="muted small">${escapeHtml(detail || 'No size/color')} · ${formatMassMoney(row.salePrice ?? row.retailPrice)} · qty ${row.quantity}</span>
              </span>
            </label>
          </li>`
      })
      .join('')

    list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const row = state.parse?.rows.find((item) => item.id === Number(input.dataset.id))
        if (row) row.selected = input.checked
        paintSelectionSummary()
        paintPreview()
      })
    })
  }

  const paintSelectionSummary = () => {
    if (!state.parse) {
      $('blh-mass-selection').textContent = ''
      return
    }
    const count = labelCount()
    const range = currentRange()
    const pages = pageCountForLabels(count, sheet, range.startIndex, range.endIndex)
    $('blh-mass-selection').textContent =
      `${selectedRows().length} selected · ${count} labels · ${pages} sheet${pages === 1 ? '' : 's'}`
  }

  const showPrint = (result: SpreadsheetParseResult) => {
    state.parse = result
    $('blh-mass-file-summary').textContent = `${result.fileName} · ${result.rows.length} items`
    $('blh-mass-drop-title').textContent = result.fileName
    paintItemList()
    paintPreview()
    paintSelectionSummary()
    $('blh-mass-print').hidden = false
  }

  const handleFile = async (file: File) => {
    setStatus('blh-mass-upload-status', `Reading ${file.name}…`)
    $('blh-mass-drop-title').textContent = `Opening ${file.name}`
    try {
      const result = await parseSpreadsheet(file)
      setStatus('blh-mass-upload-status', `${result.rows.length} items ready to print.`, 'success')
      showPrint(result)
    } catch (err) {
      setStatus(
        'blh-mass-upload-status',
        err instanceof Error ? err.message : 'Could not read that spreadsheet.',
        'error',
      )
      $('blh-mass-drop-title').textContent = 'Drop your spreadsheet here'
    }
  }

  const printLabels = async () => {
    const labels = expandMassSelectedRows(selectedRows(), state.copiesFromQty)
    if (!labels.length) {
      setStatus('blh-mass-print-status', 'Select at least one item first.', 'error')
      return
    }

    const range = currentRange()
    const printBtn = $('blh-mass-print-btn') as HTMLButtonElement
    printBtn.disabled = true
    printBtn.textContent = 'Preparing labels…'
    setStatus('blh-mass-print-status', '')
    try {
      const pdfBytes = await buildMassLabelPdf(
        labels,
        sheet,
        range.startRow,
        range.startCol,
        range.endRow,
        range.endCol,
      )
      const opened = await openPdfInNewTab(pdfBytes)
      const pages = pageCountForLabels(labels.length, sheet, range.startIndex, range.endIndex)
      if (!opened.ok) {
        setStatus('blh-mass-print-status', opened.error, 'error')
        return
      }
      setStatus(
        'blh-mass-print-status',
        `${labels.length} labels on ${pages} sheet${pages === 1 ? '' : 's'}. Print at 100% scale.`,
        'success',
      )
    } catch (err) {
      setStatus(
        'blh-mass-print-status',
        err instanceof Error ? err.message : 'Could not print these labels.',
        'error',
      )
    } finally {
      printBtn.disabled = false
      printBtn.textContent = 'Print labels'
    }
  }

  const loadSample = async () => {
    try {
      const url = chrome.runtime.getURL('sample-inventory.csv')
      const res = await fetch(url)
      if (!res.ok) throw new Error('Could not load the sample file.')
      const blob = await res.blob()
      const file = new File([blob], 'sample-inventory.csv', { type: 'text/csv' })
      await handleFile(file)
    } catch (err) {
      setStatus(
        'blh-mass-upload-status',
        err instanceof Error ? err.message : 'Could not load the sample file.',
        'error',
      )
    }
  }

  buildGrid()

  const dropzone = $('blh-mass-dropzone')
  const fileInput = $('blh-mass-file') as HTMLInputElement
  const form = $('blh-mass-upload-form') as HTMLFormElement

  form.addEventListener('submit', (event) => event.preventDefault())

  const onFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void handleFile(file)
  }

  fileInput.addEventListener('change', () => onFiles(fileInput.files))

  const onDragEnter = (event: Event) => {
    event.preventDefault()
    dropzone.classList.add('is-dragging')
  }
  const onDragLeave = (event: Event) => {
    event.preventDefault()
    dropzone.classList.remove('is-dragging')
  }

  dropzone.addEventListener('dragenter', onDragEnter)
  dropzone.addEventListener('dragover', onDragEnter)
  dropzone.addEventListener('dragleave', onDragLeave)
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault()
    dropzone.classList.remove('is-dragging')
    onFiles((event as DragEvent).dataTransfer?.files ?? null)
  })

  $('blh-mass-copies-qty').addEventListener('change', (event) => {
    state.copiesFromQty = (event.target as HTMLInputElement).checked
    paintSelectionSummary()
  })

  $('blh-mass-select-all').addEventListener('click', () => {
    state.parse?.rows.forEach((row) => {
      row.selected = true
    })
    paintItemList()
    paintPreview()
    paintSelectionSummary()
  })

  $('blh-mass-select-none').addEventListener('click', () => {
    state.parse?.rows.forEach((row) => {
      row.selected = false
    })
    paintItemList()
    paintPreview()
    paintSelectionSummary()
  })

  $('blh-mass-new-file').addEventListener('click', () => {
    state.parse = null
    fileInput.value = ''
    $('blh-mass-print').hidden = true
    $('blh-mass-drop-title').textContent = 'Drop your spreadsheet here'
    setStatus('blh-mass-upload-status', '')
    setStatus('blh-mass-print-status', '')
  })

  $('blh-mass-print-btn').addEventListener('click', () => {
    void printLabels()
  })

  $('blh-mass-sample').addEventListener('click', () => {
    void loadSample()
  })

  return () => {
    host.replaceChildren()
  }
}
