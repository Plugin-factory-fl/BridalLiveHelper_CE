import { isBridalLiveAppHost } from '../lib/config'

const BUTTON_ID = 'blh-open-panel'

/** Remove the old viewport overlay button from earlier Helper versions. */
function removeLauncher(): void {
  if (!isBridalLiveAppHost()) return
  document.getElementById(BUTTON_ID)?.remove()
}

if (document.body) {
  removeLauncher()
} else {
  document.addEventListener('DOMContentLoaded', removeLauncher, { once: true })
}
