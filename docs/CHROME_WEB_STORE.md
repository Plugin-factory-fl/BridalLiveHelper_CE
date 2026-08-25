# Chrome Web Store — BridalLive Helper 0.0.1

This file is what you paste and upload. The listing itself is created in the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

**Version in the package is `0.0.1`.**

## 1. Build the zip

```bash
npm run package:zip
```

That writes `bridallive-helper-0.0.1.zip` at the repo root. Upload **that zip**, not the whole project and not `node_modules`.

## 2. Dashboard fields

Use a **private** listing (Google Group of shop emails) or **unlisted** (anyone with the link). Unlisted is simpler for one boutique: send staff the store URL.

| Field | Paste this |
|-------|------------|
| Name | BridalLive Helper |
| Version | 0.0.1 (comes from the zip) |
| Visibility | Private or Unlisted — not Public |
| Language | English |
| Category | Productivity |
| Privacy policy URL | https://bridallivehelper-ce.onrender.com/privacy |

### Short description (132 characters max)

```
Side workstation for BridalLive: look up inventory, add sizes and colors, and print labels.
```

### Detailed description

```
BridalLive Helper sits beside BridalLive so boutique staff can look up inventory, add a size or color, add an item to an open sale, and print Avery 5160 labels without leaving the sale or receiving screen.

This listing is for The Chic Boutique (White Plains and Poughkeepsie). Staff sign in on Home with a shop account and pick the boutique they are working at. BridalLive API keys stay on the Helper server. Settings is only text size and inventory columns.

You need Chrome 141 or newer. Open https://app.bridallive.com, then click BL on the page or the Helper icon in the toolbar.

Version 0.0.1.
```

### Single purpose

```
Help bridal boutique staff look up BridalLive inventory and print labels beside the BridalLive page.
```

## 3. Permission justifications

Chrome will ask why each permission exists.

- **storage** — Save the staff Helper sign-in, working boutique, text size, and inventory column choices on that computer.
- **tabs** — Find the open BridalLive tab so the side panel can sit beside it and add an item to the sale on that tab.
- **sidePanel** — Show the Helper next to BridalLive.
- **https://app.bridallive.com/** and **https://*.bridallive.com/** — Run on the BridalLive app (content script and the BL button). Not used on unrelated sites.
- **https://bridallivehelper-ce.onrender.com/** — Talk to this shop’s Helper server for sign-in and live inventory.

## 4. Screenshots (you take these)

Chrome requires at least one screenshot of the **real extension**:

- 1280 × 800 or 640 × 400
- PNG or JPEG
- No rounded corners, no phone frames, no extra marketing chrome

Suggested three shots:

1. Home, signed in, White Plains or Poughkeepsie selected
2. Inventory search results beside a BridalLive sale
3. Labels / print preview or receiving voucher

The store icon is the 128×128 `BL` mark already in the zip. Promo tiles (440×280, etc.) are optional.

## 5. After you submit

1. Wait for the listing to be published (private/unlisted review is usually shorter than public).
2. Open the store URL while signed into Chrome as a shop Google account (or as a member of the private Google Group).
3. Click **Add to Chrome**.
4. Open BridalLive and click **BL**.

Staff should **not** use Load unpacked once the listing is live. Updates come from the store when you upload a new zip with a higher version than 0.0.1.
