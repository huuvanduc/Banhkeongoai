# banhkeongoai — initial storefront

A Vietnamese-language, mobile-responsive demonstration with 13 products: three seller-provided supplement listings and the original ten sample products. Prices use VND. The prototype now includes customer registration/login, separate first-time administrator setup/login, and a product editor. This is still not a production commerce backend.

## Seller catalog update

Added Mivolis Calcium + D3 (300 tablets, VND 250,000, expiry 02/2029), Doppelherz aktiv Magnesium + Calcium + D3 (40 tablets, VND 185,000, expiry 01/2028), and Doppelherz aktiv Magnesium 400 (30 tablets, VND 160,000, expiry not supplied). Only retail prices are stored; wholesale prices and unsupported ingredient/pregnancy claims are omitted. User-supplied photographs are reference images, not evidence of current batch expiry. Each new item has a explicitly simulated inventory of 10 for testing, not a confirmed real stock count. The original sample products remain unchanged.

## Try it

Browse categories or search by product/brand, open product details, add items to the cart, adjust quantities, and complete a demo order using fictitious delivery information. Select either QR or card to preview the intended flow. The **Đăng nhập** button supports a customer account or a separate owner account. On the first device, the **Chủ cửa hàng** tab creates the local administrator; later visits on that browser use the same tab to sign in. The footer's **Quản lý thử nghiệm** requires that local administrator and opens tools for adding products, editing full product details, changing price/stock, and reviewing demo orders.

## How it works

- `index.html`: page structure, catalog, accessible native dialog windows, and checkout fields.
- `style.css`: brand colors, typography, grids, mobile layout, and interaction states.
- `products.js`: ten sample records; replace with the real catalog before launch.
- `app.js`: catalog filters, sorting, cart calculations, validation, local account prototype, demo orders, and management controls.
- `assets/`: optimized product reference images. Original sources are recorded in `ASSET_SOURCES.json`; permission to reuse commercially has not been verified. Replace with shop/supplier-authorized photos before public launch.

The project deliberately uses plain HTML, CSS, and JavaScript for an approachable first version. There are no external runtime dependencies or installation requirements. The deployable storefront lives at the repository root so GitHub Pages can publish from `main` and `/(root)`. Asset paths are relative, so the project also works under the `/Banhkeongoai/` project-site path. For local development, serve the repository root with a small HTTP server.

## GitHub Pages deployment

In repository **Settings → Pages**, select **Deploy from a branch**, then choose `main` and `/(root)`. Changes become public only after a pull request is merged into `main` and the Pages deployment completes.

## State and payments

Demo orders still exist only in the current page's memory and reset on refresh. Customer and administrator accounts, plus product edits, use this browser's local storage so they survive refreshes only on the same browser/device. Passwords are transformed with PBKDF2 before local storage, but all browser-side code and data remain under the visitor's control. This is an interface and learning prototype—not secure authentication or authorization—and must not be used with real customer data or real passwords.

Customer details are not sent to a backend. No payment QR is generated, card number is collected, email is sent, or delivery is booked. The illustrative delivery charge is VND 30,000 and is not a carrier quote. Product image editing accepts an existing `/assets/...` path or an HTTPS image URL; it does not upload image files.

Sample inventory decreases after a demo order; cancelling an order restores its stock. Restoring a cancelled order checks availability first. Quantities cannot exceed sample stock. Editing inventory reconciles quantities already in the cart.

## Production implementation still required

1. Supply the actual ten products: authorized photos, price, variant/pack size, stock, weight, origin, ingredients/allergens where relevant, storage and label information, expiry/batch details. Verify the source country from the actual item, not brand nationality.
2. Choose production hosting and a domain. The private review Site is separate from a public customer launch.
3. Replace the local account/catalog prototype with a persistent backend/database and server-side authentication and role authorization. Prevent public self-registration from creating administrators. Calculate prices, shipping, stock, and order totals on the server. Reserve stock atomically and synchronize the Facebook selling workflow.
4. Connect a merchant-approved QR/card provider via hosted payment pages. Keep credentials server-side, verify signed provider callbacks, handle duplicate notifications idempotently, and reconcile payment/stock states. Do not mark an order paid based only on browser navigation.
5. Specify the local carrier, pickup address, coverage, weights, shipping rates, fulfillment process and tracking integration.
6. Add actual contact/Facebook details and store-approved delivery, returns and privacy information; complete applicable business/product requirements before accepting orders.
7. Test payment sandbox success/failure/cancellation, carrier failures, stock races, permission boundaries, backups, and the mobile checkout with the actual production integrations.

## Budget planning

Suggested initial service allowance: VND 500,000–1,000,000/month, not a quote for this preview or a confirmed Sites price. Excludes paid development/maintenance labor, stock, packaging, shipping, advertising, and transaction fees. Reserve roughly VND 300,000–800,000/year for a domain as a planning estimate; actual initial and renewal prices depend on extension and registrar.

Reference checked during this build: Haravan lists Omni Pro at VND 680,000/month with a commerce website (https://www.haravan.com/pages/pricing). Confirm billing commitments, promotions and tax before purchasing. payOS advertises free collection transactions on its homepage (https://payos.vn/); verify merchant/bank eligibility and service terms, and do not assume the QR fee applies to card processing. Obtain a written card-provider quote before launch.

## Verification

Syntax and local-asset checks, plus targeted JavaScript checks for filtering, quantity limits, totals, input escaping and demo order creation. No browser visual/end-to-end QA was requested or performed. Optional WebMCP tools feature-detect support; live WebMCP validation was unavailable in this environment.
