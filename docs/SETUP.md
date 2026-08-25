# Set up BridalLive Helper

Staff do this once per computer. After that, open BridalLive and click **BL**.

BridalLive Retailer IDs and API keys are **not** pasted into the Helper. They live on the Helper server. Settings is only text size and inventory columns.

## Install in Chrome

The shop’s long-term install is a **private Chrome Web Store listing**. Until that listing is live, load the built `dist/` folder as an unpacked extension:

1. Get the built Helper folder (`dist/`). If you are building from this project:

   ```bash
   npm install
   npm run build
   ```

2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `dist` folder.
5. Open **https://app.bridallive.com**, then click **BL** (or the Helper toolbar icon).

Use **Chrome 141 or newer**. After a Helper update, click **Reload** on the extension card in `chrome://extensions`.

## Sign in

1. Open the Helper on **Home**.
2. Sign in with your shop email and password (or create an account if the shop allows it).
3. Pick **White Plains** or **Poughkeepsie**. You can switch later on Home.

Inventory, new sizes/colors, receiving vouchers, and label reprints use live BridalLive data for that boutique. You must be signed in — the Helper does not fall back to a sample catalog as the real path.

If sign-in fails, the Helper server may be asleep or missing shop accounts. Ask Alex.

## After setup

- On a **sale**: look up a style, add a size or color, then add the item to the open order.
- On **receiving**: load the voucher in **Labels** and print one label per received piece.
- Print labels at **100%** scale. Do not use “Fit to page.”

## Helper server (Alex)

Production API: **https://bridallivehelper-ce.onrender.com**.

Copy `.env.example` to `.env` (local) or set the same variables on Render:

- `HELPER_USERS` — seed accounts (imported once, then hashed in `data/helper-users.json`)
- `BL_WP_RETAILER_ID` / `BL_WP_API_KEY` — White Plains
- `BL_PK_RETAILER_ID` / `BL_PK_API_KEY` — Poughkeepsie
- Optional `HELPER_SIGNUP_CODE` if Create account should require a shop PIN

On Render, attach a **persistent disk** at `/opt/render/project/src/data` (or set `HELPER_DATA_DIR` to the mount). Without a disk, created accounts and sign-in sessions disappear when the service restarts.

The extension never receives BridalLive keys. Signed-in staff call `/bl/...` on the Helper server; the server logs into BridalLive and forwards allowlisted inventory, receiving, and POS requests.
