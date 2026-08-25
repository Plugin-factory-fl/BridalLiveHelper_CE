# Phase 3 — complete product

Phase 3 is the **finish line**: BridalLive Helper as a fully working product the customer can use every day with BridalLive, not a demo or a side build.

## What “done” means

- The **complete extension** works with a **backend server in place**.
- Staff **log in** as users of the Helper (not only paste BridalLive API keys into Settings).
- **Each bridal shop** manages **its own inventory** through the Helper — locations stay separate and correct.
- The product is **stable enough for real floor use**: inventory lookup, new sizes/colors, add to an open sale, and label printing, with **minimal bugs**.
- The extension is **hosted on the Chrome Web Store as a private listing**, so the customer installs and updates it the normal Chrome way. Unpacked `dist/` loads are for development, not how the shop runs the product.
- The **customer has a fully working product** and can use it as intended beside BridalLive.

## How staff use it (The Chic Boutique)

An employee of The Chic Boutique signs in and works. They never see or paste BridalLive Retailer IDs or API keys.

1. **Login lives on Home.** The Home tab is where staff sign in and sign out.
2. **Working location.** After login, the employee picks **which location they are working at** (White Plains or Poughkeepsie) and can switch when they move between shops.
3. **Settings** is text size and inventory columns — not a key vault. Choose the location on Home; inventory and labels follow that shop.
4. **The backend holds the BridalLive APIs and IDs** for each location. Every signed-in user gets the right catalog for the location they selected.

The Helper still sits beside BridalLive. Login is for the Helper; staff also stay signed into BridalLive in the main tab.

## How this sits with earlier work

| Phase | Intent |
|-------|--------|
| 1 | Side panel workflows on mock data so the UI could be demonstrated. |
| 2 | Live BridalLive API: connected stores, inventory search, variants, receiving labels, reprint. Keys were pasted in Settings. |
| **3** | **Ship the real product:** backend, Home login, per-location inventory via a location picker, private CWS hosting, production quality. |

## Product bar

Work in this repo should move toward that bar, not away from it. Features such as Mass Labeling, login, and store hosting exist to make the Helper a complete shop tool — not a local unpacked experiment.

## Helper server (development)

Until Render hosts this, run the API locally so Home login can succeed:

1. Copy `.env.example` to `.env` and set `HELPER_USERS` plus each location’s BridalLive Retailer ID and API key.
2. `npm run server` — listens on `http://127.0.0.1:8787`.
3. Build with `VITE_API_BASE_URL=http://127.0.0.1:8787` only when you want the panel to hit that local server.

Production builds talk to **https://bridallivehelper-ce.onrender.com** by default.

The server never returns those BridalLive keys to the extension. Staff only send email, password, and a location id.
