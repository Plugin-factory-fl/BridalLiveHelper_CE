import { STORAGE_KEYS } from '../lib/config'

async function loadPdf(): Promise<void> {
  const data = await chrome.storage.session.get(STORAGE_KEYS.helperPrintPdfBytes)
  const raw = data[STORAGE_KEYS.helperPrintPdfBytes] as number[] | undefined
  if (!raw?.length) {
    document.body.textContent = 'Print preview expired — generate the PDF again from Labels.'
    return
  }

  const blob = new Blob([new Uint8Array(raw)], { type: 'application/pdf' })
  const embed = document.getElementById('blh-pdf') as HTMLEmbedElement
  embed.src = URL.createObjectURL(blob)
}

void loadPdf()
