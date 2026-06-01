# Inventory & special orders pillar

Client goal (Ricky): staff on **order/POS** screens need a **side workstation** to look up items, catch duplicates, and add size/color variants without leaving the order.

## MVP vs Phase 2

| | **MVP (now)** | **Phase 2** |
|---|----------------|-------------|
| Data | `mockInventoryProvider` | `bridalliveInventoryProvider` |
| Panel UI | Complete workflows | **Unchanged** |
| Swap surface | `src/inventory/provider.ts` | Implement `bridallive-inventory-provider.ts` |

See [MVP_ROADMAP.md](./MVP_ROADMAP.md) for the full checklist and demo script.

## Requirements vs current build

| Requirement | MVP status |
|---------------|------------|
| Side workstation on orders | Done |
| Search by style, vendor, size, color, item # | Done (mock catalog, 7+ SKUs) |
| Duplicate warning | Done |
| Add variants + clone from source | Done (mock; appends to in-memory catalog) |
| Order context banner + prefill | Done (selectors optional) |
| Copy / apply item # to order | Clipboard + apply when selectors set |
| Live BridalLive data | Phase 2 |

## Architecture

```
Panel → MSG.* → bridge → inventory/service.ts → getInventoryProvider()
                                                    ├── mock (MVP)
                                                    ├── render (optional env)
                                                    └── bridallive (Phase 2 stub)
```

## Testing the MVP demo

1. `app.bridallive.com` → open side panel
2. Settings → Dev override → **Order / POS**
3. Inventory → search `Iris`, size `8`, color `Light Pink` → duplicate warning
4. Add variant size `14` → new mock item #; search again to see it listed
5. **Use as source** on a row → variant form prefilled

## Phase 2 (BridalLive API only)

1. Elite API credentials in Settings
2. Implement auth + Swagger endpoints in `bridallive-inventory-provider.ts`
3. Set `VITE_BRIDALLIVE_API=true` or runtime config

DOM selectors ([BRIDALLIVE_CONTEXT.md](./BRIDALLIVE_CONTEXT.md)) remain useful for **apply to order line** even when inventory uses the API.
