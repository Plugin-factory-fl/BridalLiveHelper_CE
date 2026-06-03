import { STORAGE_KEYS } from '../lib/config'
import type { PrintPreviewMeta } from '../labels/types'

function formatMeta(meta: PrintPreviewMeta): string {
  const parts = [
    `${meta.labelCount} label${meta.labelCount === 1 ? '' : 's'}`,
    `${meta.pageCount} page${meta.pageCount === 1 ? '' : 's'}`,
    meta.layoutSummary,
    meta.averyStart,
  ]
  return parts.filter(Boolean).join(' · ')
}

function paintMeta(meta: PrintPreviewMeta | null): void {
  const metaEl = document.getElementById('blh-preview-meta')
  const noteEl = document.getElementById('blh-preview-sheet-note')
  if (!metaEl) return

  if (!meta) {
    metaEl.textContent = 'No print job details'
    if (noteEl) noteEl.textContent = ''
    return
  }

  metaEl.textContent = formatMeta(meta)
  if (noteEl) {
    noteEl.textContent = `Sheet: ${meta.sheetName}. Generated ${new Date(meta.generatedAt).toLocaleString()}.`
  }
}

async function loadPdf(): Promise<void> {
  const data = await chrome.storage.session.get([
    STORAGE_KEYS.helperPrintPdfBytes,
    STORAGE_KEYS.helperPrintPreviewMeta,
  ])
  const raw = data[STORAGE_KEYS.helperPrintPdfBytes] as number[] | undefined
  const meta = data[STORAGE_KEYS.helperPrintPreviewMeta] as PrintPreviewMeta | undefined

  paintMeta(meta ?? null)

  const embed = document.getElementById('blh-pdf') as HTMLEmbedElement
  const fallback = document.getElementById('blh-preview-fallback') as HTMLElement

  if (!raw?.length) {
    embed.hidden = true
    fallback.hidden = false
    return
  }

  const blob = new Blob([new Uint8Array(raw)], { type: 'application/pdf' })
  embed.src = URL.createObjectURL(blob)
}

document.getElementById('blh-preview-print')?.addEventListener('click', () => {
  window.print()
})

document.getElementById('blh-preview-close')?.addEventListener('click', () => {
  void chrome.tabs.getCurrent().then((tab) => {
    if (tab?.id !== undefined) void chrome.tabs.remove(tab.id)
  })
})

void loadPdf()
