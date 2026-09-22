# Phase 1 launch checklist

The application now fails closed: a customer cannot submit an order until the launch gate reports no blockers. The admin dashboard shows the exact missing fields.

## Implemented in the repository

- PostgreSQL persistence for users, sessions, products, orders, order items, inventory movements, payment events, settings, and audit logs.
- HTTP-only server sessions, customer registration, command-line-only administrator creation, role middleware, request rate limits, origin validation, secure headers, and a restrictive content security policy.
- Expiring email-verification and password-reset tokens, password-change session invalidation, and a retryable email outbox.
- Verified product fields for origin, weight, ingredients, allergens, directions, warnings, storage, batch, expiry, photo source, photo authorization, and record verification.
- Database enforcement that prevents a product from becoming active unless its record and photograph rights are verified.
- Server-authoritative VND prices and totals, transaction locks on inventory, atomic stock reservation, idempotency keys, and stock release when hosted payment creation or payment fails.
- Automatic expiry for abandoned payment reservations, idempotent stock release, guarded order-status transitions, tracking capture, customer order history, and late-payment review flags.
- Provider boundaries for live shipping quotes and hosted QR/card checkout. Secrets remain server-side; signed payment callbacks are deduplicated and reconciled against the order amount.
- Admin-managed business contact details, privacy/shipping/returns policies, and supplement/skincare notices.
- Automated unit and security-contract checks.

## Merchant input still required before opening orders

- Enter the real legal/business name, public phone, email, address, official page, and shop-approved policy text.
- Create each real product from its physical label or supplier record. Enter confirmed price, actual stock, packed weight, origin, batch/expiry, and category-specific label information.
- Upload only shop-owned or supplier-authorized photographs, record their source, and check both verification boxes. Old demonstration assets are not automatically authorized.
- Select a Vietnamese carrier/aggregator, hosted QR/card provider, and transactional email provider. Implement their exact request/response mapping in `server/services/integrations.js` and `server/services/email.js`, then set the matching environment values.
- Run sandbox tests for payment success/failure/cancel/duplicate callbacks, shipping quote failures, simultaneous last-item orders, customer/admin permission boundaries, session expiry, backups/restores, and mobile checkout.
- Use HTTPS and a production PostgreSQL service. GitHub Pages cannot run this server and must not be used for accepting orders.
- Configure scheduled jobs: `npm run orders:expire` and `npm run mail:send` every one to five minutes, plus `npm run sessions:cleanup` daily. Monitor failures and alert on a growing email outbox or orders marked `requires_review`.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Run `npm install`, `npm run db:migrate`, and then create the first administrator:

   `npm run admin:create -- "Owner Name" owner@example.com "a-long-unique-password"`

4. Start the application with `npm run dev` and open `http://localhost:3000`.

Do not set `accepting_orders`, `shipping_enabled`, `payment_enabled`, or `email_enabled` merely to remove a blocker. Enable them only after the actual integration has passed its sandbox and security tests.
