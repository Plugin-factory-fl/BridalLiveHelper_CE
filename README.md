# BridalLive Helper

Chrome extension for [BridalLive](https://app.bridallive.com): inventory lookup, size/color variants, and custom labels — in a **Chrome side panel** beside the app (Eureka AI pattern).

## How it works

Uses the **`sidePanel` API** — Chrome shows the helper next to the tab and resizes BridalLive automatically. The extension does **not** inject an iframe into the page or change BridalLive’s DOM.

## Quick start

```bash
npm install
npm run build
```

1. `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`
2. Open **`https://app.bridallive.com`**
3. Click the **BridalLive Helper** toolbar icon to open the side panel (or click the **BL** button on the page)

Requires **Chrome 141+** (side panel open/close animation on tab switch).

## Development

```bash
npm run dev
```

Reload the extension after changes.

## MVP vs Phase 2

**MVP** ships full workflows on **mock data** — search, duplicates, variants, labels — so you can demo to the client without API access.

**Phase 2** swaps `src/inventory/bridallive-inventory-provider.ts` (and labels) for the [BridalLive API](https://help.bridallive.com/hc/en-us/articles/48218682047764-BridalLive-API-Overview); panel UI stays the same.

See [MVP roadmap](docs/MVP_ROADMAP.md).

## Docs

- [MVP roadmap](docs/MVP_ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Inventory pillar](docs/INVENTORY_PILLAR.md)
- [BridalLive URL context](docs/BRIDALLIVE_CONTEXT.md)
