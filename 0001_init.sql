PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'Manual',
  phone_number TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','sold','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_status_country
ON products(status, country);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  note TEXT DEFAULT '',
  amount INTEGER NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','cancelled')),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending','processing','fulfilled','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

INSERT OR IGNORE INTO products
(country,country_code,provider,phone_number,price,currency,status)
VALUES
('Indonesia','ID','Manual','+6281230000001',15000,'IDR','available'),
('Malaysia','MY','Manual','+601100000001',18000,'IDR','available'),
('United States','US','Manual','+12025550101',25000,'IDR','available');
