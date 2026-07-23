# MVP roadmap — workflows first, API swap in Phase 2

## Strategy

**Phase 1 (MVP):** Ship complete **staff workflows** in the side panel using **mock data**. Every feature goes through stable UI → message → **provider interface** → mock implementation.

**Phase 2:** Replace the mock provider with **BridalLive’s official API** ([API overview](https://help.bridallive.com/hc/en-us/articles/48218682047764-BridalLive-API-Overview), [Swagger](https://www.bridallive.com/docs/swagger/index.html)) without redesigning the panel.

```
Panel views  →  MSG.*  →  content/bridge.ts  →  */service.ts  →  getXxxProvider()
                                                              ├── mock (MVP) ✅
                                                              └── bridallive (Phase 2) 🔜
```

## Phase 1 checklist (MVP — mock complete)

### Platform

- [x] Chrome side panel beside `app.bridallive.com`
- [x] BL floating toggle open/close
- [x] Screen context (order / receiving / inventory / unknown)
- [x] Dev screen override for demos

### Inventory & special orders

- [x] Search by style, vendor, size, color, item #
- [x] Results table with copy / use-as-source / add-to-order (sale search selector wired)
- [x] Duplicate warning on search (style + size + color)
- [x] Live duplicate preview on variant form
- [x] Add variant form + clone-from-source field
- [x] Order-screen banner + prefill when `orderLine` available
- [x] Mock catalog large enough to demo realistic search
- [ ] Demo script rehearsed (see below)

### Labels (secondary pillar — mock shell)

- [x] Department + Avery position + single-item mock print
- [ ] Receiving voucher batch UI (mock lines) — optional MVP polish
- [ ] Grid label picker placeholder documented

### Settings

- [x] Mock store selector
- [x] Data source indicator (Mock / Phase 2)
- [ ] Load saved settings on open

### Phase 2 prep (no live API yet)

- [x] `InventoryProvider` interface
- [x] `bridallive-inventory-provider.ts` stub with swap instructions
- [ ] `LabelsProvider` interface (same pattern)
- [x] Credentials UI in Settings (per-location Retailer ID + API key → `chrome.storage.local`)

## Phase 2 checklist (BridalLive API — swap only)

Prerequisites from client: **Elite plan**, API access approved, Retailer ID + API Key, QA testing.

| Step | Work |
|------|------|
| 1 | Implement `bridallive-inventory-provider.ts` (`apiLogin`, token refresh, search + create endpoints from Swagger) |
| 2 | Store credentials in `chrome.storage` or proxy via Render |
| 3 | Set `getInventoryProvider()` to use BridalLive when configured |
| 4 | Map API models → `InventoryItem` / duplicate rules |
| 5 | Labels provider → BL print or PDF endpoints |
| 6 | Remove or gate mock provider in production builds |

**Files to touch in Phase 2 (not the panel views):**

- `src/inventory/bridallive-inventory-provider.ts`
- `src/inventory/provider.ts`
- `src/lib/bridallive-auth.ts` (new)
- `src/api/client.ts` (labels/auth if needed)
- `manifest.config.ts` (host permission for API base URL)

## MVP demo script (5 minutes)

1. Open `app.bridallive.com` → click **BL** → side panel opens.
2. **Settings** → Dev override → **Order / POS** → Save.
3. **Home** → confirms order context hints.
4. **Inventory** → search `Iris`, size `8`, color `Light Pink` → duplicate warning, existing `DR-10043`.
5. Change size to `10` → no duplicate → add variant → mock item # returned.
6. Click **Use as source** on `DR-10042` → variant form prefilled.
7. Mention Phase 2: same screens, live catalog via BridalLive API.

## What “swap ready” means

If a workflow still calls `fetch` or mock arrays **inside a panel view**, it is not swap-ready. All data must flow through:

- `searchInventory()` / `createVariant()` in `src/inventory/service.ts`
- Future: `printLabels()` in `src/labels/service.ts`

Panel code should only know `MSG.*` and response types — never BridalLive URLs or tokens.
