# How BridalLive Helper works

The Helper is a **Chrome side panel**. Chrome places it next to the BridalLive tab and resizes the page. BridalLive’s screens are not wrapped, overlaid, or rewritten.

```
┌─────────────────────────────┬──────────────────┐
│  BridalLive (as usual)      │  BridalLive      │
│                             │  Helper          │
└─────────────────────────────┴──────────────────┘
```

## What staff see

| Place | What it is for |
|-------|----------------|
| Side panel | Inventory, Labels, and Settings |
| **BL** button on the page | Open or close the Helper (drag to move it) |
| Chrome toolbar icon | Same as **BL** — opens the Helper |
| Home | Which BridalLive screen you are on, and a shortcut into Inventory or Labels |

## How work gets done

- **Search and new sizes/colors** talk to BridalLive after you connect a location in Settings. If nothing is connected, Inventory uses a sample catalog.
- **Add to order** uses the sale you have open in the BridalLive tab.
- **Labels** build a PDF in the Helper and open Chrome’s print preview. Receiving vouchers and item lookups use the connected store.

Nothing in the Helper is meant to replace BridalLive. It is a workstation beside the page you already use.

## Install notes

Load the unpacked extension from the `dist/` folder after a build. Details are in [Set up the Helper](./SETUP.md).

The product destination (backend, login, per-shop inventory, private Chrome Web Store) is [Phase 3](./PHASE_3.md).
