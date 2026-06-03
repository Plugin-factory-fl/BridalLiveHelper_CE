import { PDF_VIEWER_ZOOM, STORAGE_KEYS } from '../lib/config'

/** Fallback if opened directly — normally PDF opens as blob: tab from the panel. */
async function loadPdf(): Promise<void> {
  const data = await chrome.storage.session.get(STORAGE_KEYS.helperPrintPdfBytes)
  const raw = data[STORAGE_KEYS.helperPrintPdfBytes] as number[] | undefined

  if (!raw?.length) {
    document.body.textContent = 'PDF expired — generate it again from Labels in the side panel.'
    return
  }

  const blob = new Blob([new Uint8Array(raw)], { type: 'application/pdf' })
  const blobUrl = URL.createObjectURL(blob)
  location.replace(`${blobUrl}${PDF_VIEWER_ZOOM}`)
}

void loadPdf()
