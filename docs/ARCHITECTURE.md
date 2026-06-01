# BridalLive Helper — Architecture

## Overview

BridalLive Helper uses the **Chrome Side Panel API** (same pattern as [Eureka AI](../EurekaAI_V1.0.0/)). Chrome places the helper UI in a **native panel beside the tab** and shrinks the webpage viewport. **Nothing is injected into BridalLive’s DOM** — no iframe overlay, no flex wrapper, no margin hacks.

```
┌─────────────────────────────┬──────────────────┐
│  BridalLive (unchanged DOM) │  Chrome side     │
│  — browser resizes viewport │  panel (our UI)  │
└─────────────────────────────┴──────────────────┘
```

## Components

| Piece | Role |
|-------|------|
| `side_panel` → `src/panel/index.html` | Full helper UI (Inventory, Labels, Settings) |
| `src/background/service-worker.ts` | `sidePanel.setPanelBehavior`, `sidePanel.open`, tab enablement |
| `src/content/bridallive.ts` | Page context (URL heuristics), API message handlers |
| `src/content/panel-launcher.ts` | Optional **BL** floating button → `open-side-panel` |
| `src/panel/bridge-client.ts` | `chrome.tabs.sendMessage` to active BridalLive tab |

## Messaging

- **Panel → page**: `chrome.tabs.sendMessage(tabId, { type: MSG.* })`
- **Page → panel**: `chrome.runtime.sendMessage({ type: MSG.CONTEXT_UPDATE, context })`
- **Open panel**: toolbar icon (`openPanelOnActionClick`) or **BL** button → `action: 'open-side-panel'`

## What we removed (v0.3.0)

- In-page `#blh-root` iframe shell
- DOM reparenting / `MutationObserver` layout fixes
- `postMessage` bridge (source of freezes and timeouts)

## Stubbed vs implemented

| Feature | Status |
|---------|--------|
| Chrome side panel UI | Implemented |
| Context detection (URL) | Implemented |
| Mock inventory / labels (MVP) | Implemented |
| Provider swap layer (`src/inventory/`, `src/labels/`) | Implemented |
| BridalLive API provider stub (Phase 2) | Stub only |
| Order-line prefill / apply item # | Scaffolded (needs selectors) |
| BridalLive API live integration | Phase 2 — [MVP_ROADMAP.md](./MVP_ROADMAP.md) |
