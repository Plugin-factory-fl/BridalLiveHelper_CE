# BridalLive page context

The extension classifies the active BridalLive screen using **URL and title heuristics** until DOM selectors are confirmed with a logged-in store account.

## Screen types

| Screen | Client workflow | Heuristic signals (foundation) |
|--------|-----------------|--------------------------------|
| `order` | Special order / POS — inventory lookup beside order | `order`, `pos`, `sale`, `transaction`, `special order` |
| `receiving` | Bulk label print from voucher | `receiv`, `voucher`, `goods receipt` |
| `inventory` | Item lookup, reprint label | `inventory`, `item`, `product` |
| `unknown` | Fallback | Everything else |

## Developer override

**Settings → Dev screen override** forces a screen type without changing the URL. Useful before selectors exist.

## Confirmed selectors (Sale / POS)

### Sale transaction (e.g. Sale #24818)

- **Screen type:** `order` (URL/title heuristics match `sale`, `transaction`, etc.)
- **Add line search:** item name / number typeahead on the sale footer
  - Selector: `input[ng-model="itemsSearchSettings.query"]`
  - Placeholder: `Search for an item by name`
  - Angular: `item-search-typeahead-grid`, on-select `chooseItem`
- **Quick-add modal button (optional):** `button[secured-by="QUICK_ADD_ITEM"]` → `openAddNewItemModal()` — not used for apply; opens manual add modal

Extension **Add to order**: (1) open gear settings panel, (2) select **Item number** radio (`itemsSearchSettings.field = 'itemNumber'`), (3) close settings, (4) fill search with item # (e.g. `49153`), (5) if the typeahead **grid** (columns Item # / Color / Size / …) shows **exactly one data row**, click that row (or call `chooseItem` on scope). Header row is ignored. Multiple data rows are left for staff to pick manually.

Debug logs (`[BridalLiveHelper] step 5…`) appear in the **BridalLive tab** DevTools console, not the side panel.

- Item number mode: `input[type="radio"][ng-model="itemsSearchSettings.field"][value="itemNumber"]`
- Item name mode: same `ng-model`, `value="itemName"` (confirm in DevTools if label differs)

### Still TODO

1. Exact pathname/hash patterns for sale vs special order vs POS (record samples)
2. Receiving voucher line table selectors
3. Style / size / color fields on sale lines (for richer prefill), if distinct from search query

## iframe panel URL

The content script loads:

`chrome.runtime.getURL('src/panel/index.html')`

Built output path may differ under `dist/`; CRXJS rewrites manifest resources automatically.
