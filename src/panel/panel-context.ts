import type { BridalLiveContext } from '../types/context'

let context: BridalLiveContext | null = null

export function setPanelContext(ctx: BridalLiveContext): void {
  context = ctx
  document.dispatchEvent(new CustomEvent('blh-context-updated'))
}

export function getPanelContext(): BridalLiveContext | null {
  return context
}
