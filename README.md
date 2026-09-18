# banhkeongoai

A Vietnamese/VND ecommerce storefront with a production-gated Node.js backend and PostgreSQL database. The store remains closed to orders until real merchant data, verified products and authorized photographs, policies, shipping, and hosted payments are configured.

## What changed

The former browser-only prototype has been replaced with:

- server-side customer and administrator authentication using HTTP-only sessions;
- role-protected product, order, settings, inventory, and audit data;
- verified product and commercial-photo authorization fields;
- persistent orders and transaction-safe inventory reservation;
- server-calculated price, shipping, and total values;
- idempotent hosted-payment creation and signed callback handling;
- live business policies and category-specific supplement/skincare notices;
- a launch gate that refuses orders while any Phase 1 requirement is incomplete.

No sample product records are loaded by the storefront. Existing image files are historical reference assets only and must not be selected unless the shop has documented commercial permission.

## Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer
- HTTPS in production
- A supported shipping quote API and hosted QR/card payment provider

## Local development

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run admin:create -- "Owner Name" owner@example.com "a-long-unique-password"
npm run dev
```

Open `http://localhost:3000`. Products begin as an empty catalog by design. Sign in as the administrator, create records from the real product labels, and keep them as drafts until both verification boxes are valid.

## Commands

| Command                       | Purpose                                             |
| ----------------------------- | --------------------------------------------------- |
| `npm run dev`                 | Start the server with file watching                 |
| `npm start`                   | Start the production server                         |
| `npm run db:migrate`          | Apply pending PostgreSQL migrations                 |
| `npm run admin:create -- ...` | Create an administrator outside public registration |
| `npm test`                    | Run automated tests                                 |
| `npm run check`               | Check server/client syntax and run tests            |

## Deployment

This version requires a Node.js host and PostgreSQL. GitHub Pages can display static files but cannot provide the secure backend required for real accounts, inventory, orders, shipping, or payments. Keep the existing Pages deployment as a non-ordering preview or replace it with the URL of the deployed server.

Set secrets in the hosting platform, never in the repository. Run migrations before switching traffic. Configure trusted HTTPS proxying only when the deployment platform documents it, and set `PUBLIC_ORIGIN` to the exact public HTTPS origin.

Provider integrations are intentionally disabled by default. `server/services/integrations.js` defines the provider boundary, but the exact payload mapping and signature format must be adapted to the merchant's selected carrier and payment provider using their current official documentation.

See [docs/PHASE-1-CHECKLIST.md](docs/PHASE-1-CHECKLIST.md) for the implementation status and launch work that requires real merchant information or credentials.
