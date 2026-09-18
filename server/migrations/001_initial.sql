CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('customer', 'admin');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE order_status AS ENUM ('pending_payment', 'paid', 'processing', 'shipped', 'completed', 'cancelled', 'payment_failed');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded');
CREATE TYPE inventory_reason AS ENUM ('order_reserved', 'order_released', 'manual_adjustment', 'restock');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  brand text NOT NULL CHECK (char_length(brand) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (category IN ('snacks', 'chocolate', 'skincare', 'supplements')),
  size text NOT NULL CHECK (char_length(size) BETWEEN 1 AND 80),
  description text NOT NULL,
  price_vnd integer NOT NULL CHECK (price_vnd BETWEEN 1000 AND 100000000),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_grams integer NOT NULL CHECK (weight_grams > 0),
  status product_status NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  image_url text,
  photo_source text,
  photo_authorized boolean NOT NULL DEFAULT false,
  record_verified boolean NOT NULL DEFAULT false,
  origin_country text,
  ingredients text,
  allergens text,
  directions text,
  warnings text,
  storage text,
  batch_number text,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT photo_authorized OR photo_source IS NOT NULL),
  CHECK (category NOT IN ('supplements', 'skincare') OR
         (ingredients IS NOT NULL AND directions IS NOT NULL AND warnings IS NOT NULL AND storage IS NOT NULL)),
  CHECK (status <> 'active' OR
         (record_verified AND photo_authorized AND image_url IS NOT NULL AND origin_country IS NOT NULL))
);
CREATE INDEX products_public_idx ON products(status, category, featured);

CREATE TABLE business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name text,
  public_phone text,
  public_email text,
  address text,
  facebook_url text,
  privacy_policy text,
  shipping_policy text,
  returns_policy text,
  supplement_disclaimer text,
  skincare_disclaimer text,
  shipping_enabled boolean NOT NULL DEFAULT false,
  payment_enabled boolean NOT NULL DEFAULT false,
  accepting_orders boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  status order_status NOT NULL DEFAULT 'pending_payment',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL CHECK (payment_method IN ('qr', 'card')),
  payment_provider text NOT NULL,
  payment_reference text UNIQUE,
  payment_checkout_url text,
  shipping_provider text NOT NULL,
  shipping_service text NOT NULL,
  shipping_quote_reference text,
  tracking_number text,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text NOT NULL,
  province text NOT NULL,
  ward text NOT NULL,
  address text NOT NULL,
  note text,
  subtotal_vnd integer NOT NULL CHECK (subtotal_vnd >= 0),
  shipping_vnd integer NOT NULL CHECK (shipping_vnd >= 0),
  total_vnd integer NOT NULL CHECK (total_vnd = subtotal_vnd + shipping_vnd),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_id_idx ON orders(user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  product_size text NOT NULL,
  unit_price_vnd integer NOT NULL CHECK (unit_price_vnd >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_vnd integer NOT NULL CHECK (line_total_vnd = unit_price_vnd * quantity)
);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  order_id uuid REFERENCES orders(id),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reason inventory_reason NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_reservation_per_order_product
  ON inventory_movements(order_id, product_id, reason)
  WHERE reason = 'order_reserved';

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);
