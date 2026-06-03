/** One-click clear (×) for inputs inside `.field-clear-wrap`. */
export function wireFieldClearButtons(root: HTMLElement): void {
  root.querySelectorAll('.field-clear-wrap').forEach((wrap) => {
    const control = wrap.querySelector('input, select')
    const btn = wrap.querySelector('.field-clear-btn')
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return
    if (!(btn instanceof HTMLButtonElement)) return

    const syncVisibility = () => {
      const hasValue =
        control instanceof HTMLSelectElement
          ? control.value !== ''
          : control.value.trim() !== ''
      btn.hidden = !hasValue
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      if (control instanceof HTMLSelectElement) {
        control.value = ''
      } else {
        control.value = ''
      }
      control.dispatchEvent(new Event('input', { bubbles: true }))
      control.dispatchEvent(new Event('change', { bubbles: true }))
      syncVisibility()
      control.focus()
    })

    control.addEventListener('input', syncVisibility)
    control.addEventListener('change', syncVisibility)
    syncVisibility()
  })
}
