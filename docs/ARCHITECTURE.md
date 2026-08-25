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
| **Home** | Sign in, sign out, and pick the working boutique |
| Side panel | Inventory, Labels, and Settings |
| **BL** button on the page | Open or close the Helper (drag to move it) |
| Chrome toolbar icon | Same as **BL** — opens the Helper |

## How work gets done

- **Login** is a Helper account (email + password) on Home. It is not the BridalLive password.
- **Working location** (White Plains or Poughkeepsie) is chosen on Home. Inventory and labels follow that shop.
- **Search, new sizes/colors, receiving vouchers, reprints, and add-to-sale** go to the Helper server as `/bl/...`. The server holds each location’s BridalLive Retailer ID and API key, signs into BridalLive, and forwards only allowlisted paths (`/api/items`, `/api/receivingVouchers`, `/api/receivingVoucherItems`, `/api/posTransactions`).
- **Add to order** still needs the sale you have open in the BridalLive tab.
- **Labels** build a PDF in the Helper and open Chrome’s print preview.

The extension never stores or displays BridalLive keys. Settings is text size and inventory columns.

Nothing in the Helper is meant to replace BridalLive. It is a workstation beside the page you already use.

## Install notes

Until the private Chrome Web Store listing is live, load the unpacked extension from the `dist/` folder after a build. Details are in [Set up the Helper](./SETUP.md).

The product destination is [Phase 3](./PHASE_3.md).
