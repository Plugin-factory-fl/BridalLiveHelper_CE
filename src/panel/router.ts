import type { ActiveView } from '../lib/config'

export type ViewRender = (root: HTMLElement) => void | (() => void)

const views = new Map<ActiveView, ViewRender>()

export function registerView(name: ActiveView, render: ViewRender): void {
  views.set(name, render)
}

export function navigate(root: HTMLElement, name: ActiveView): (() => void) | void {
  const render = views.get(name)
  if (!render) return
  root.replaceChildren()
  return render(root)
}
