# Set up BridalLive Helper

Do this once per computer. After that, staff only need to open BridalLive and click **BL**.

## Install in Chrome

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

## Connect your stores

Inventory, new sizes/colors, receiving vouchers, and label reprints use live BridalLive data only after each location is connected.

1. In the Helper, open **Settings**.
2. For **White Plains** and **Poughkeepsie**, paste the **Retailer ID** and **API key**.
   - In BridalLive: **Settings → Account → API**
   - Each location has its own pair.
3. Set **Store data** to **Live store** for real inventory. Use **Practice** only when you are working in BridalLive’s QA site.
4. Click **Test connection**, then **Save**.

Keys stay in this Chrome profile on this computer. They are not uploaded anywhere else.

Until a location is connected, Inventory shows a sample catalog so you can still explore the Helper.

## After setup

- On a **sale**: look up a style, add a size or color, then add the item to the open order.
- On **receiving**: load the voucher in **Labels** and print one label per received piece.
- Print labels at **100%** scale. Do not use “Fit to page.”
