CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  customer_email TEXT NOT NULL,
  total_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  pdf_object_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
