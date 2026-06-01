import { isBridalLiveAppHost } from '../lib/config'
import { log } from '../lib/log'
import { initBridge, notifyPanelContext, refreshContext } from './bridge'

let lastHash = ''

function onNavigation(): void {
  const hash = location.hash
  if (hash === lastHash) return
  lastHash = hash
  refreshContext()
  notifyPanelContext()
}

function watchNavigation(): void {
  lastHash = location.hash
  window.addEventListener('hashchange', onNavigation)
  window.addEventListener('popstate', onNavigation)
}

function main(): void {
  if (!isBridalLiveAppHost()) {
    log('skipped on non-app host', location.hostname)
    return
  }

  log('content script active', location.href)
  initBridge()
  refreshContext()
  watchNavigation()
}

main()
