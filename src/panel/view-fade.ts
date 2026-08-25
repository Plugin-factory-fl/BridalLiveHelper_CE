export function playViewFade(el: HTMLElement | null | undefined): void {
  if (!el || el.hidden) return
  el.classList.remove('view-fade')
  void el.offsetWidth
  el.classList.add('view-fade')
}
