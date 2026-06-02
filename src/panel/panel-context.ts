import { STORAGE_KEYS } from '../lib/config'
import type { BridalLiveContext } from '../types/context'

let context: BridalLiveContext | null = null

/** Restore last known BridalLive screen context (survives tab switches / panel remounts). */
export async function initPanelContextFromStorage(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lastBridalLiveContext)
  const stored = data[STORAGE_KEYS.lastBridalLiveContext] as BridalLiveContext | undefined
  if (stored) {
    context = stored
  }
}

export function setPanelContext(ctx: BridalLiveContext): void {
  context = ctx
  void chrome.storage.local.set({ [STORAGE_KEYS.lastBridalLiveContext]: ctx })
  document.dispatchEvent(new CustomEvent('blh-context-updated'))
}

export function getPanelContext(): BridalLiveContext | null {
  return context
}
