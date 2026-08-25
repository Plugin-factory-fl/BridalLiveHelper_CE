import { BL_SELECTORS } from '../bridallive/selectors'
import { log, warn } from '../lib/log'
import type { OrderLineHints } from '../types/context'

const ITEM_NUMBER_FIELD = 'itemNumber'

type ItemsSearchSettings = {
  query?: string
  field?: string
  barcode?: boolean
}

type AngularScope = {
  itemsSearchSettings?: ItemsSearchSettings
  $parent?: AngularScope
  $apply?: (fn?: () => void) => void
  $applyAsync?: (fn?: () => void) => void
  $$childHead?: AngularScope | null
  $$nextSibling?: AngularScope | null
}

type NgModelController = {
  $setViewValue: (value: string, trigger?: string) => void
  $render: () => void
}

type AngularElement = {
  scope: () => AngularScope
  controller: (name: string) => NgModelController | null
}

type AngularGlobal = {
  element: (el: Element) => AngularElement
}

const STEP_MS = 320
const RADIO_POLL_MS = 100
const RADIO_POLL_MAX = 2000
const TYPEAHEAD_POLL_MS = 120
const TYPEAHEAD_POLL_MAX = 4500
const TYPEAHEAD_INITIAL_MS = 550

function getAngular(): AngularGlobal | undefined {
  const w = window as Window & { angular?: AngularGlobal }
  return w.angular
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function readInput(selector: string | null): string | undefined {
  if (!selector) return undefined
  const el = document.querySelector(selector)
  if (!el) return undefined
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const v = el.value.trim()
    return v || undefined
  }
  const text = el.textContent?.trim()
  return text || undefined
}

function setNativeInputValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

function walkScopes(scope: AngularScope | null | undefined, visit: (s: AngularScope) => void): void {
  if (!scope) return
  visit(scope)
  walkScopes(scope.$$childHead, visit)
  walkScopes(scope.$$nextSibling, visit)
}

function forEachItemsSearchScope(
  startEl: Element,
  fn: (settings: ItemsSearchSettings, scope: AngularScope) => void,
): boolean {
  const angular = getAngular()
  if (!angular) return false

  let hit = false
  const visit = (scope: AngularScope) => {
    if (scope.itemsSearchSettings) {
      fn(scope.itemsSearchSettings, scope)
      hit = true
    }
  }

  try {
    walkScopes(angular.element(startEl).scope(), visit)
    walkScopes(angular.element(document.body).scope(), visit)
  } catch (e) {
    warn('forEachItemsSearchScope', e)
  }
  return hit
}

function applyDigest(startEl: Element): void {
  const angular = getAngular()
  if (!angular) return
  try {
    const scope = angular.element(startEl).scope()
    scope.$applyAsync?.() ?? scope.$apply?.()
  } catch {
    /* ignore */
  }
}

function setItemNumberSearchField(startEl: HTMLInputElement): boolean {
  const updated = forEachItemsSearchScope(startEl, (settings) => {
    settings.field = ITEM_NUMBER_FIELD
    settings.barcode = true
  })
  if (updated) applyDigest(startEl)
  return updated
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findSaleSearchGroup(input: HTMLInputElement): Element | null {
  return (
    input.closest('.input-group') ??
    input.closest('.hidden-xs.input-group') ??
    input.parentElement?.closest('.input-group') ??
    null
  )
}

function getOpenSettingsMenu(): Element | null {
  return (
    document.querySelector('.dropdown.open .dropdown-menu') ??
    document.querySelector('.dropdown-menu.open') ??
    document.querySelector('.open > .dropdown-menu')
  )
}

function isSettingsPanelOpen(searchInput: HTMLInputElement): boolean {
  if (getOpenSettingsMenu()) return true
  const mode = findItemNumberModeInPanel(searchInput)
  return Boolean(mode && isVisible(mode))
}

/**
 * Gear beside sale search — `button.items-search_settings` on the input group,
 * NOT the mode rows inside the open dropdown (those also use items-search_settings).
 */
function findSaleSearchSettingsToggle(searchInput: HTMLInputElement): HTMLElement | null {
  const group = findSaleSearchGroup(searchInput)
  if (!group) return null

  for (const btn of Array.from(group.querySelectorAll('button.items-search_settings'))) {
    if (!(btn instanceof HTMLElement)) continue
    if (btn.closest('.dropdown-menu')) continue
    return btn
  }

  for (const btn of Array.from(group.querySelectorAll('button'))) {
    if (!(btn instanceof HTMLElement)) continue
    if (btn.closest('.dropdown-menu')) continue
    const ng = btn.getAttribute('ng-click') ?? ''
    if (ng.includes('openAddNewItemModal')) continue
    if (btn.querySelector('.fa-cog, .fa-gear, .glyphicon-cog, .icon-cog')) {
      return btn
    }
  }

  for (const toggle of Array.from(
    group.querySelectorAll('[data-toggle="dropdown"], .dropdown-toggle'),
  )) {
    if (toggle instanceof HTMLElement && !toggle.closest('.dropdown-menu')) {
      return toggle
    }
  }

  return null
}

function openSaleSearchSettings(searchInput: HTMLInputElement): boolean {
  if (isSettingsPanelOpen(searchInput)) {
    log('settings panel already open')
    return true
  }
  const toggle = findSaleSearchSettingsToggle(searchInput)
  if (!toggle) return false
  log('open settings', toggle.className, toggle.getAttribute('ng-click') ?? '')
  toggle.click()
  return true
}

function closeSaleSearchSettings(searchInput: HTMLInputElement): void {
  const menu = getOpenSettingsMenu()
  const closeInMenu =
    menu?.querySelector('button[aria-label="Close"]') ??
    document.querySelector('button.items-search_settings[aria-label="Close"]')
  if (closeInMenu instanceof HTMLElement && isVisible(closeInMenu)) {
    log('close settings (Close button)')
    closeInMenu.click()
    return
  }

  const toggle = findSaleSearchSettingsToggle(searchInput)
  if (toggle && isSettingsPanelOpen(searchInput)) {
    log('close settings (gear toggle)')
    toggle.click()
    return
  }

  searchInput.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
  )
  document.body.click()
  log('close settings (escape / body click)')
}

function searchRootsForFieldRadio(searchInput: HTMLInputElement): Element[] {
  const group = findSaleSearchGroup(searchInput)
  const roots: Element[] = [document.body]
  if (group) roots.unshift(group)
  for (const menu of Array.from(
    document.querySelectorAll(
      '.dropdown-menu, ul.dropdown-menu, .popover, [uib-popover-template-popup], [uib-dropdown-menu]',
    ),
  )) {
    roots.push(menu)
  }
  return [...new Set(roots)]
}

function isItemNumberFieldRadio(radio: HTMLInputElement): boolean {
  const ngModel = radio.getAttribute('ng-model') ?? ''
  if (ngModel.includes('itemsSearchSettings.field') && radio.value === ITEM_NUMBER_FIELD) {
    return true
  }
  const wrap = radio.closest('.radio')
  const text = wrap?.textContent?.toLowerCase() ?? ''
  return text.includes('item number') && !text.includes('item name')
}

function findItemNumberBarcodeButton(root: Element): HTMLElement | null {
  for (const btn of Array.from(
    root.querySelectorAll(
      'button[ng-click="itemsSearchSettings.barcode = true"], button.items-search_settings[ng-click*="barcode = true"]',
    ),
  )) {
    if (btn instanceof HTMLElement) return btn
  }
  return null
}

/** Item number control inside open settings: radio (field) and/or barcode button. */
function findItemNumberModeInPanel(searchInput: HTMLInputElement): HTMLElement | null {
  const menu = getOpenSettingsMenu()
  const roots: Element[] = []
  if (menu) roots.push(menu)
  const group = findSaleSearchGroup(searchInput)
  if (group) roots.push(group)
  roots.push(document.body)

  for (const root of roots) {
    const btn = findItemNumberBarcodeButton(root)
    if (btn && isVisible(btn)) return btn

    for (const radio of Array.from(
      root.querySelectorAll(
        'input[type="radio"][ng-model="itemsSearchSettings.field"], input[type="radio"][ng-model*="itemsSearchSettings.field"]',
      ),
    )) {
      if (radio instanceof HTMLInputElement && isItemNumberFieldRadio(radio) && isVisible(radio)) {
        return radio
      }
    }

    for (const wrap of Array.from(root.querySelectorAll('.radio'))) {
      const text = wrap.textContent?.toLowerCase() ?? ''
      if (!text.includes('item number') || text.includes('item name')) continue
      const radio = wrap.querySelector('input[type="radio"]')
      if (radio instanceof HTMLInputElement && isVisible(radio)) return radio
      const label = wrap.querySelector('label')
      if (label instanceof HTMLElement && isVisible(label)) return label
    }
  }

  return null
}

function findItemNumberFieldRadio(searchInput: HTMLInputElement): HTMLInputElement | null {
  const { order } = BL_SELECTORS
  if (order.itemSearchModeItemNumber) {
    const exact = document.querySelector(order.itemSearchModeItemNumber)
    if (exact instanceof HTMLInputElement) return exact
  }

  for (const root of searchRootsForFieldRadio(searchInput)) {
    for (const radio of Array.from(
      root.querySelectorAll(
        'input[type="radio"][ng-model="itemsSearchSettings.field"], input[type="radio"][ng-model*="itemsSearchSettings.field"]',
      ),
    )) {
      if (radio instanceof HTMLInputElement && isItemNumberFieldRadio(radio)) {
        return radio
      }
    }
  }

  for (const wrap of Array.from(document.querySelectorAll('.radio'))) {
    const text = wrap.textContent?.toLowerCase() ?? ''
    if (!text.includes('item number') || text.includes('item name')) continue
    const radio = wrap.querySelector('input[type="radio"]')
    if (radio instanceof HTMLInputElement && isItemNumberFieldRadio(radio)) {
      return radio
    }
  }

  return null
}

async function waitForVisibleItemNumberMode(
  searchInput: HTMLInputElement,
): Promise<HTMLElement | null> {
  const deadline = Date.now() + RADIO_POLL_MAX
  while (Date.now() < deadline) {
    const control = findItemNumberModeInPanel(searchInput)
    if (control) return control
    await delay(RADIO_POLL_MS)
  }
  return null
}

function isItemNumberSearchActive(searchInput: HTMLInputElement): boolean {
  let field: string | undefined
  let barcode: boolean | undefined
  forEachItemsSearchScope(searchInput, (settings) => {
    field = settings.field
    barcode = settings.barcode
  })
  return field === ITEM_NUMBER_FIELD || barcode === true
}

function activateItemNumberMode(control: HTMLElement, searchInput: HTMLInputElement): void {
  const angular = getAngular()

  if (control instanceof HTMLInputElement && control.type === 'radio') {
    control.focus()
    control.click()
    control.checked = true
    control.dispatchEvent(new Event('change', { bubbles: true }))
    control.dispatchEvent(new Event('click', { bubbles: true }))
    control.closest('label')?.click()

    if (angular) {
      try {
        const ngModel = angular.element(control).controller('ngModel')
        ngModel?.$setViewValue(ITEM_NUMBER_FIELD, 'change')
        ngModel?.$render()
      } catch {
        /* ignore */
      }
    }
    log('selected item number radio', control.value)
  } else {
    control.click()
    log('clicked item number label/control', control.tagName)
  }

  setItemNumberSearchField(searchInput)
}

/**
 * Match manual flow: open settings → Item number → close settings → then caller fills search.
 */
async function switchToItemNumberSearchMode(input: HTMLInputElement): Promise<void> {
  log('step 1: open sale search settings')
  if (!openSaleSearchSettings(input)) {
    warn('settings toggle not found beside sale search input')
    return
  }
  await delay(STEP_MS)

  log('step 2: select item number in open settings')
  const modeControl = await waitForVisibleItemNumberMode(input)
  if (modeControl) {
    activateItemNumberMode(modeControl, input)
  } else {
    warn('item number control not visible in open settings')
    setItemNumberSearchField(input)
  }
  await delay(STEP_MS)

  log('step 3: close sale search settings')
  closeSaleSearchSettings(input)
  await delay(STEP_MS)

  setItemNumberSearchField(input)
}

/** Sync value into AngularJS ng-model so BL item-search-typeahead-grid runs its API search. */
function syncBridalLiveSaleSearchModel(el: HTMLInputElement, value: string): void {
  setNativeInputValue(el, value)

  const angular = getAngular()
  if (angular) {
    try {
      const ngEl = angular.element(el)
      const ngModel = ngEl.controller('ngModel')
      if (ngModel?.$setViewValue) {
        ngModel.$setViewValue(value, 'change')
        ngModel.$render()
      }

      forEachItemsSearchScope(el, (settings) => {
        settings.query = value
      })
      applyDigest(el)
    } catch (e) {
      warn('syncBridalLiveSaleSearchModel angular', e)
    }
  }

  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: value,
      inputType: 'insertText',
    }),
  )
  el.dispatchEvent(new Event('change', { bubbles: true }))
  window.setTimeout(() => {
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }))
  }, 80)
}

function isSaleSearchSettingsMenu(menu: Element): boolean {
  if (
    menu.querySelector(
      'input[type="radio"][ng-model*="itemsSearchSettings.field"], button[ng-click*="itemsSearchSettings.barcode"]',
    )
  ) {
    return true
  }
  return Boolean(menu.querySelector('button.items-search_settings[aria-label="Close"]'))
}

function isNoItemsFoundText(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t.includes('no items found') || t.includes('no results') || t === 'no matches'
}

function looksLikeItemSearchGrid(el: Element): boolean {
  const text = el.textContent ?? ''
  return (
    (text.includes('Item #') || text.includes('Item#')) &&
    (text.includes('Vendor') || text.includes('Dept'))
  )
}

function isHeaderTableRow(row: HTMLElement): boolean {
  if (row.closest('thead')) return true
  if (row.querySelector('th')) return true
  const text = row.textContent?.trim().toLowerCase() ?? ''
  if (text.includes('item #') && text.includes('color') && text.includes('vendor')) return true
  return false
}

function isTypeaheadResultRow(el: HTMLElement): boolean {
  if (!isVisible(el)) return false
  if (el.classList.contains('divider') || el.classList.contains('dropdown-header')) return false
  if (isHeaderTableRow(el)) return false
  if (isNoItemsFoundText(el.textContent ?? '')) return false
  return true
}

function findTypeaheadClickTarget(row: HTMLElement): HTMLElement {
  const ngRow = row.closest('[ng-click*="chooseItem"]')
  if (ngRow instanceof HTMLElement) return ngRow

  for (const sel of [
    '[ng-click*="chooseItem"]',
    '[ng-click*="select("]',
    'a[ng-click]',
    'a',
    'td',
  ]) {
    const el = row.querySelector(sel)
    if (el instanceof HTMLElement && isVisible(el) && !isNoItemsFoundText(el.textContent ?? '')) {
      return el
    }
  }
  if (row.matches('[ng-click*="chooseItem"]') || row.hasAttribute('ng-click')) return row
  return row
}

/** Data rows only — excludes grid header row (Item # / Color / Size / …). */
function getTypeaheadDataRows(root: Element): HTMLElement[] {
  if (isSaleSearchSettingsMenu(root)) return []

  const rows: HTMLElement[] = []
  const seen = new Set<HTMLElement>()

  const push = (row: HTMLElement) => {
    const target = findTypeaheadClickTarget(row)
    if (!isTypeaheadResultRow(target)) return
    if (seen.has(target)) return
    seen.add(target)
    rows.push(target)
  }

  for (const tr of Array.from(root.querySelectorAll('tbody tr'))) {
    if (tr instanceof HTMLElement) push(tr)
  }
  if (rows.length > 0) return rows

  for (const tr of Array.from(root.querySelectorAll('tr'))) {
    if (tr instanceof HTMLElement && !isHeaderTableRow(tr)) push(tr)
  }
  if (rows.length > 0) return rows

  for (const row of Array.from(
    root.querySelectorAll(
      '[ng-repeat*="match in matches"], [ng-repeat*="item in items"], [ng-click*="chooseItem"]',
    ),
  )) {
    if (row instanceof HTMLElement) push(row)
  }
  if (rows.length > 0) return rows

  for (const li of Array.from(root.querySelectorAll('li'))) {
    if (!(li instanceof HTMLElement)) continue
    if (li.classList.contains('dropdown-header') || li.classList.contains('divider')) continue
    if (li.querySelector('thead')) continue
    if (li.querySelector('table') && !li.querySelector('tbody tr')) continue
    push(li)
  }

  return rows
}

function typeaheadMenuShowsNoResults(menu: Element): boolean {
  if (getTypeaheadDataRows(menu).length > 0) return false
  return isNoItemsFoundText(menu.textContent ?? '')
}

function popupDistanceFromSearch(searchInput: HTMLInputElement, popup: HTMLElement): number {
  const group = findSaleSearchGroup(searchInput)
  if (group?.contains(popup)) return 0
  const inputRect = searchInput.getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()
  return Math.abs(popupRect.top - inputRect.bottom) + Math.abs(popupRect.left - inputRect.left)
}

/** BL item-search-typeahead-grid popup (table with Item # / Vendor columns). */
function findItemSearchTypeaheadPopups(searchInput: HTMLInputElement): HTMLElement[] {
  const openSettings = getOpenSettingsMenu()
  const popups = new Set<HTMLElement>()

  const consider = (el: Element | null) => {
    if (!(el instanceof HTMLElement) || !isVisible(el)) return
    if (el === openSettings || isSaleSearchSettingsMenu(el)) return
    if (getTypeaheadDataRows(el).length > 0 || looksLikeItemSearchGrid(el)) {
      popups.add(el)
    }
  }

  for (const menu of Array.from(
    document.querySelectorAll(
      'ul.dropdown-menu, .dropdown-menu, [uib-typeahead-popup], .typeahead',
    ),
  )) {
    consider(menu)
  }

  for (const table of Array.from(document.querySelectorAll('table'))) {
    if (!isVisible(table)) continue
    const wrap = table.closest(
      '.dropdown-menu, ul.dropdown-menu, [uib-typeahead-popup], .typeahead',
    )
    consider(wrap ?? (looksLikeItemSearchGrid(table) ? table : null))
  }

  const group = findSaleSearchGroup(searchInput)
  if (group) {
    for (const el of Array.from(group.querySelectorAll('.dropdown-menu, ul.dropdown-menu, table'))) {
      consider(el)
    }
  }

  return [...popups].sort(
    (a, b) => popupDistanceFromSearch(searchInput, a) - popupDistanceFromSearch(searchInput, b),
  )
}

type ScopeWithChooseItem = AngularScope & {
  chooseItem?: (item: unknown) => void
  matches?: unknown[]
  items?: unknown[]
}

function itemNumberFromUnknown(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim()
    return s || null
  }
  if (typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  for (const key of ['itemNumber', 'itemNumberString', 'itemNbr', 'number']) {
    const raw = obj[key]
    if (raw != null && String(raw).trim()) return String(raw).trim()
  }
  return null
}

/** Pull Item # from a typeahead grid row (prefers the Item # column). */
function extractItemNumberFromRow(row: HTMLElement): string | null {
  const cells = Array.from(row.querySelectorAll('td'))
  if (cells.length > 0) {
    for (const cell of cells.slice(0, 3)) {
      const text = cell.textContent?.trim() ?? ''
      if (/^\d{3,}$/.test(text)) return text
    }
  }

  const labeled = row.querySelector(
    '[data-title*="Item"], [aria-label*="Item"], .item-number, .itemNumber',
  )
  const labeledText = labeled?.textContent?.trim()
  if (labeledText && /^\d{3,}$/.test(labeledText)) return labeledText

  const text = row.textContent ?? ''
  const match = text.match(/\b(\d{4,})\b/)
  return match?.[1] ?? null
}

function findExactItemNumberRow(
  rows: HTMLElement[],
  itemNumber: string,
): HTMLElement | null {
  const want = itemNumber.trim()
  if (!want) return null

  for (const row of rows) {
    const fromCells = extractItemNumberFromRow(row)
    if (fromCells === want) return findTypeaheadClickTarget(row)

    for (const cell of Array.from(row.querySelectorAll('td'))) {
      if (cell.textContent?.trim() === want) return findTypeaheadClickTarget(row)
    }
  }
  return null
}

/** Prefer chooseItem only when the match's item # equals the requested number. */
function tryAngularChooseExactMatch(
  searchInput: HTMLInputElement,
  itemNumber: string,
): boolean {
  const angular = getAngular()
  if (!angular) return false
  const want = itemNumber.trim()
  if (!want) return false

  let done = false
  const visit = (scope: AngularScope | null | undefined) => {
    if (!scope || done) return
    const s = scope as ScopeWithChooseItem
    if (typeof s.chooseItem === 'function') {
      const lists = [s.matches, s.items].filter((x): x is unknown[] => Array.isArray(x))
      for (const list of lists) {
        const match = list.find((entry) => itemNumberFromUnknown(entry) === want)
        if (match) {
          try {
            s.chooseItem(match)
            applyDigest(searchInput)
            done = true
            log('step 5: chooseItem exact item #', want)
            return
          } catch (e) {
            warn('chooseItem failed', e)
          }
        }
      }
    }
    walkScopes(scope.$$childHead, visit)
    walkScopes(scope.$$nextSibling, visit)
  }

  try {
    visit(angular.element(searchInput).scope())
    visit(angular.element(document.body).scope())
  } catch (e) {
    warn('tryAngularChooseExactMatch', e)
  }
  return done
}

function findHighlightedGridRow(popup: Element): HTMLElement | null {
  for (const sel of [
    'tbody tr.active',
    'tr.active',
    'li.active',
    '[ng-click*="chooseItem"].active',
  ]) {
    const el = popup.querySelector(sel)
    if (el instanceof HTMLElement && isTypeaheadResultRow(el)) {
      return findTypeaheadClickTarget(el)
    }
  }
  return null
}

function clickTypeaheadTarget(target: HTMLElement): void {
  target.focus()
  target.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
  )
  target.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
  )
  target.click()
}

/**
 * Auto-select only when a typeahead row's Item # exactly matches.
 * Never picks a lone fuzzy/partial match.
 */
async function tryAutoSelectExactTypeaheadResult(
  searchInput: HTMLInputElement,
  itemNumber: string,
): Promise<boolean> {
  await delay(TYPEAHEAD_INITIAL_MS)
  const deadline = Date.now() + TYPEAHEAD_POLL_MAX
  const want = itemNumber.trim()

  while (Date.now() < deadline) {
    if (isSettingsPanelOpen(searchInput)) {
      await delay(TYPEAHEAD_POLL_MS)
      continue
    }

    if (tryAngularChooseExactMatch(searchInput, want)) {
      await delay(STEP_MS)
      return true
    }

    for (const popup of findItemSearchTypeaheadPopups(searchInput)) {
      if (typeaheadMenuShowsNoResults(popup)) continue

      const rows = getTypeaheadDataRows(popup)
      const exact = findExactItemNumberRow(rows, want)
      if (exact) {
        log('step 5: auto-select exact item # row', want, exact.textContent?.trim().slice(0, 120))
        clickTypeaheadTarget(exact)
        await delay(STEP_MS)
        tryAngularChooseExactMatch(searchInput, want)
        return true
      }

      const highlighted = findHighlightedGridRow(popup)
      if (highlighted && extractItemNumberFromRow(highlighted) === want) {
        clickTypeaheadTarget(highlighted)
        await delay(STEP_MS)
        return true
      }

      if (rows.length > 0) {
        log(
          'typeahead rows without exact item # match',
          rows.length,
          'want=',
          want,
          'seen=',
          rows.map((r) => extractItemNumberFromRow(r)).filter(Boolean).slice(0, 8),
        )
      }
    }

    await delay(TYPEAHEAD_POLL_MS)
  }

  warn('typeahead auto-select: no exact item # match within timeout', want)
  return false
}

/** Reads the active order line from BridalLive when selectors are configured. */
export function readOrderLineHints(): OrderLineHints | null {
  const { order } = BL_SELECTORS
  const itemNumber = readInput(order.itemNumberInput)
  const style = readInput(order.styleInput)
  const size = readInput(order.sizeInput)
  const color = readInput(order.colorInput)

  if (!itemNumber && !style && !size && !color) return null

  return { itemNumber, style, size, color }
}

/**
 * Switches to Item number search, fills the exact item #, and selects only an
 * exact typeahead match (never a fuzzy single hit).
 */
export async function applySaleSearchToOrder(
  saleSearchQuery: string,
): Promise<{ ok: boolean; error?: string; autoSelected?: boolean }> {
  const selector = BL_SELECTORS.order.itemNumberInput
  if (!selector) {
    return {
      ok: false,
      error: 'Stay on the sale screen and try adding this item again.',
    }
  }

  const trimmed = saleSearchQuery.trim()
  if (!trimmed) {
    return { ok: false, error: 'Enter an item number to add to the sale.' }
  }

  const el = document.querySelector(selector)
  if (!el || !(el instanceof HTMLInputElement)) {
    return { ok: false, error: 'Could not find item search on this sale. Stay on the sale screen and try again.' }
  }

  if (el.disabled) {
    return {
      ok: false,
      error: 'Item search is disabled on this line. Select or clear the current line first.',
    }
  }

  try {
    await switchToItemNumberSearchMode(el)

    log('step 4: fill sale search with exact item number', trimmed)
    el.focus()
    await delay(STEP_MS)
    syncBridalLiveSaleSearchModel(el, trimmed)

    const autoSelected = await tryAutoSelectExactTypeaheadResult(el, trimmed)

    log('applySaleSearchToOrder done', {
      query: trimmed,
      field: isItemNumberSearchActive(el) ? ITEM_NUMBER_FIELD : '(not confirmed)',
      autoSelected,
    })

    if (!autoSelected) {
      return {
        ok: false,
        autoSelected: false,
        error: `Could not find exact item # ${trimmed} in the sale search dropdown. Check that you are on a sale for the same store, then try again or pick the row manually.`,
      }
    }

    return { ok: true, autoSelected: true }
  } catch (e) {
    warn('applySaleSearchToOrder failed', e)
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not add this item to the order',
    }
  }
}
