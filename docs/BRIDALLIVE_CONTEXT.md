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

## TODO: confirm with live app

When you have access to `https://app.bridallive.com`, record:

1. Exact pathname/hash for:
   - Create / edit order
   - Receiving voucher list and detail
   - Inventory item search and edit
2. CSS selectors for:
   - Order line item number input
   - Receiving line table (SKU, qty)
   - Item duplicate / edit / save actions
3. Whether BridalLive is a SPA (History API) — already handled via `pushState` hooks.

Add findings to this file as:

```markdown
### Order create
- URL: `/...`
- Item # input: `#...` or `[name="..."]`
```

## iframe panel URL

The content script loads:

`chrome.runtime.getURL('src/panel/index.html')`

Built output path may differ under `dist/`; CRXJS rewrites manifest resources automatically.
