ALTER TABLE business_settings
  ADD COLUMN email_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE orders
  ADD COLUMN reservation_expires_at timestamptz,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN version integer NOT NULL DEFAULT 1;

UPDATE orders
   SET reservation_expires_at = created_at + interval '30 minutes'
 WHERE status = 'pending_payment' AND reservation_expires_at IS NULL;

CREATE INDEX orders_expiring_reservations_idx
  ON orders(reservation_expires_at)
  WHERE status = 'pending_payment';

CREATE UNIQUE INDEX one_release_per_order_product
  ON inventory_movements(order_id, product_id, reason)
  WHERE reason = 'order_released';

CREATE TABLE account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_user_purpose_idx
  ON account_tokens(user_id, purpose, created_at DESC);
CREATE INDEX account_tokens_expiry_idx ON account_tokens(expires_at);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx
  ON email_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');
