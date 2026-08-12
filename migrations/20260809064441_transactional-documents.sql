-- P2P, Q2C, GL, inventory, generic lineage, and audit models. Child rows carry
-- company_id too, with composite FKs that make cross-company document linking
-- impossible even for a caller who guesses another tenant's IDs.

CREATE TABLE public.purchase_requisitions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  requested_by text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  needed_by date NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  CHECK (needed_by >= date)
);

CREATE TABLE public.purchase_requisition_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_requisition_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, purchase_requisition_id)
    REFERENCES public.purchase_requisitions(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.rfqs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  expected_quote_by date NOT NULL,
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'sent', 'quotes_received', 'awarded', 'closed', 'cancelled')),
  awarded_vendor_id text,
  awarded_quote_id text,
  award_po_id text,
  awarded_at timestamptz,
  awarded_by text,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, awarded_vendor_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE SET NULL,
  CHECK (expected_quote_by >= date)
);

CREATE TABLE public.rfq_sources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id text NOT NULL,
  purchase_requisition_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, rfq_id, purchase_requisition_id),
  FOREIGN KEY (company_id, rfq_id)
    REFERENCES public.rfqs(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, purchase_requisition_id)
    REFERENCES public.purchase_requisitions(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.rfq_invited_suppliers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id text NOT NULL,
  supplier_id text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, rfq_id, supplier_id),
  FOREIGN KEY (company_id, rfq_id)
    REFERENCES public.rfqs(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.rfq_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, rfq_id)
    REFERENCES public.rfqs(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.rfq_quotes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id text NOT NULL,
  vendor_id text NOT NULL,
  received_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  total numeric(18,3) NOT NULL DEFAULT 0 CHECK (total >= 0),
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, rfq_id, vendor_id),
  FOREIGN KEY (company_id, rfq_id)
    REFERENCES public.rfqs(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, vendor_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.rfq_quote_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_quote_id text NOT NULL,
  rfq_line_id text NOT NULL,
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  lead_time_days integer NOT NULL CHECK (lead_time_days >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, rfq_quote_id, rfq_line_id),
  FOREIGN KEY (company_id, rfq_quote_id)
    REFERENCES public.rfq_quotes(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, rfq_line_id)
    REFERENCES public.rfq_lines(company_id, id) ON DELETE CASCADE
);

CREATE TABLE public.purchase_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier_id text NOT NULL,
  pr_id text,
  date date NOT NULL DEFAULT current_date,
  expected_date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  payment_term_id text NOT NULL,
  warehouse_id text NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, pr_id)
    REFERENCES public.purchase_requisitions(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, payment_term_id)
    REFERENCES public.payment_terms(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (expected_date >= date)
);

CREATE TABLE public.purchase_order_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, purchase_order_id)
    REFERENCES public.purchase_orders(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.goods_receipts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  po_id text NOT NULL,
  supplier_id text NOT NULL,
  warehouse_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, po_id)
    REFERENCES public.purchase_orders(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.goods_receipt_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  goods_receipt_id text NOT NULL,
  po_line_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL CHECK (qty_received > 0),
  lot_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, goods_receipt_id)
    REFERENCES public.goods_receipts(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, po_line_id)
    REFERENCES public.purchase_order_lines(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.vendor_bills (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier_id text NOT NULL,
  po_id text,
  grn_id text,
  invoice_number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  paid numeric(18,3) NOT NULL DEFAULT 0 CHECK (paid >= 0),
  three_way_match text NOT NULL DEFAULT 'review'
    CHECK (three_way_match IN ('matched', 'discrepancy', 'review')),
  discrepancy_reason text,
  source_ocr_job_id bigint,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  UNIQUE (company_id, supplier_id, invoice_number),
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, po_id)
    REFERENCES public.purchase_orders(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, grn_id)
    REFERENCES public.goods_receipts(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (due_date >= date),
  CHECK (paid <= total)
);

CREATE TABLE public.vendor_bill_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_bill_id text NOT NULL,
  po_line_id text,
  grn_line_id text,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, vendor_bill_id)
    REFERENCES public.vendor_bills(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, po_line_id)
    REFERENCES public.purchase_order_lines(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, grn_line_id)
    REFERENCES public.goods_receipt_lines(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.vendor_payments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier_id text NOT NULL,
  bank_account_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('wire', 'cheque', 'cash')),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, bank_account_id)
    REFERENCES public.bank_accounts(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.vendor_payment_allocations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_payment_id text NOT NULL,
  bill_id text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, vendor_payment_id, bill_id),
  FOREIGN KEY (company_id, vendor_payment_id)
    REFERENCES public.vendor_payments(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, bill_id)
    REFERENCES public.vendor_bills(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.vendor_returns (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  grn_id text NOT NULL,
  supplier_id text NOT NULL,
  warehouse_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  debit_note_id text,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, grn_id)
    REFERENCES public.goods_receipts(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.vendor_return_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_return_id text NOT NULL,
  grn_line_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  reason_code text NOT NULL
    CHECK (reason_code IN ('damaged', 'wrong_item', 'quality_fail', 'expired', 'other')),
  notes text,
  lot_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, vendor_return_id)
    REFERENCES public.vendor_returns(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, grn_line_id)
    REFERENCES public.goods_receipt_lines(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.debit_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier_id text NOT NULL,
  vendor_return_id text NOT NULL,
  bill_id text,
  date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  settled numeric(18,3) NOT NULL DEFAULT 0 CHECK (settled >= 0),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, supplier_id)
    REFERENCES public.suppliers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, vendor_return_id)
    REFERENCES public.vendor_returns(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, bill_id)
    REFERENCES public.vendor_bills(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (settled <= total)
);

ALTER TABLE public.vendor_returns
  ADD CONSTRAINT vendor_returns_debit_note_fk
  FOREIGN KEY (company_id, debit_note_id)
  REFERENCES public.debit_notes(company_id, id)
  ON DELETE SET NULL;

CREATE TABLE public.opportunities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  title text NOT NULL,
  stage text NOT NULL
    CHECK (stage IN ('qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value numeric(18,3) NOT NULL DEFAULT 0 CHECK (value >= 0),
  probability numeric(5,4) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 1),
  next_action text,
  days_idle integer NOT NULL DEFAULT 0 CHECK (days_idle >= 0),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.quotes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  opportunity_id text,
  date date NOT NULL DEFAULT current_date,
  valid_until date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, opportunity_id)
    REFERENCES public.opportunities(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (valid_until >= date)
);

CREATE TABLE public.quote_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, quote_id)
    REFERENCES public.quotes(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sales_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  quote_id text,
  date date NOT NULL DEFAULT current_date,
  expected_delivery_date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  warehouse_id text NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  blocked_reason text,
  exceptional boolean NOT NULL DEFAULT false,
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, quote_id)
    REFERENCES public.quotes(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (expected_delivery_date >= date)
);

CREATE TABLE public.sales_order_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sales_order_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, sales_order_id)
    REFERENCES public.sales_orders(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.delivery_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  so_id text NOT NULL,
  customer_id text NOT NULL,
  warehouse_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, so_id)
    REFERENCES public.sales_orders(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.delivery_note_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delivery_note_id text NOT NULL,
  so_line_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_delivered numeric(18,6) NOT NULL CHECK (qty_delivered > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, delivery_note_id)
    REFERENCES public.delivery_notes(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, so_line_id)
    REFERENCES public.sales_order_lines(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.customer_invoices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  so_id text,
  dn_id text,
  date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  paid numeric(18,3) NOT NULL DEFAULT 0 CHECK (paid >= 0),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, so_id)
    REFERENCES public.sales_orders(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, dn_id)
    REFERENCES public.delivery_notes(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (due_date >= date),
  CHECK (paid <= total)
);

CREATE TABLE public.customer_invoice_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_invoice_id text NOT NULL,
  so_line_id text,
  dn_line_id text,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  discount numeric(18,3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  qty_received numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_delivered numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_delivered >= 0),
  qty_invoiced numeric(18,6) NOT NULL DEFAULT 0 CHECK (qty_invoiced >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_invoice_id)
    REFERENCES public.customer_invoices(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, so_line_id)
    REFERENCES public.sales_order_lines(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, dn_line_id)
    REFERENCES public.delivery_note_lines(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.customer_receipts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  bank_account_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('wire', 'cheque', 'cash', 'card')),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, bank_account_id)
    REFERENCES public.bank_accounts(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.customer_receipt_allocations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_receipt_id text NOT NULL,
  invoice_id text NOT NULL,
  amount numeric(18,3) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, customer_receipt_id, invoice_id),
  FOREIGN KEY (company_id, customer_receipt_id)
    REFERENCES public.customer_receipts(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, invoice_id)
    REFERENCES public.customer_invoices(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.customer_returns (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  dn_id text NOT NULL,
  customer_id text NOT NULL,
  warehouse_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  credit_note_id text,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, dn_id)
    REFERENCES public.delivery_notes(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.customer_return_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_return_id text NOT NULL,
  dn_line_id text NOT NULL,
  product_id text NOT NULL,
  description text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  tax_code_id text,
  reason_code text NOT NULL CHECK (reason_code IN (
    'damaged', 'wrong_item', 'not_as_described', 'customer_dissatisfied', 'expired', 'other'
  )),
  notes text,
  lot_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, customer_return_id)
    REFERENCES public.customer_returns(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, dn_line_id)
    REFERENCES public.delivery_note_lines(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.credit_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  customer_id text NOT NULL,
  customer_return_id text NOT NULL,
  invoice_id text,
  date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  subtotal numeric(18,3) NOT NULL DEFAULT 0,
  tax_total numeric(18,3) NOT NULL DEFAULT 0,
  total numeric(18,3) NOT NULL DEFAULT 0,
  applied numeric(18,3) NOT NULL DEFAULT 0 CHECK (applied >= 0),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, customer_id)
    REFERENCES public.customers(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, customer_return_id)
    REFERENCES public.customer_returns(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, invoice_id)
    REFERENCES public.customer_invoices(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (applied <= total)
);

ALTER TABLE public.customer_returns
  ADD CONSTRAINT customer_returns_credit_note_fk
  FOREIGN KEY (company_id, credit_note_id)
  REFERENCES public.credit_notes(company_id, id)
  ON DELETE SET NULL;

CREATE TABLE public.journal_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  state text NOT NULL DEFAULT 'draft',
  source_type text,
  source_id text,
  description text NOT NULL DEFAULT '',
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.journal_entry_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_entry_id text NOT NULL,
  account_id text NOT NULL,
  description text NOT NULL DEFAULT '',
  debit numeric(18,3) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,3) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, journal_entry_id)
    REFERENCES public.journal_entries(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, account_id)
    REFERENCES public.accounts(company_id, id) ON DELETE RESTRICT,
  CHECK ((debit = 0) <> (credit = 0))
);

CREATE TABLE public.stock_moves (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  product_id text NOT NULL,
  warehouse_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  cost_per_unit numeric(18,3) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  lot_number text,
  source_type text NOT NULL,
  source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.internal_transfers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  from_warehouse_id text NOT NULL,
  to_warehouse_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, from_warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, to_warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE public.internal_transfer_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  internal_transfer_id text NOT NULL,
  product_id text NOT NULL,
  qty numeric(18,6) NOT NULL CHECK (qty > 0),
  lot_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, internal_transfer_id)
    REFERENCES public.internal_transfers(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.stock_adjustments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  state text NOT NULL DEFAULT 'draft',
  approved_by text,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number)
);

CREATE TABLE public.stock_adjustment_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_adjustment_id text NOT NULL,
  product_id text NOT NULL,
  warehouse_id text NOT NULL,
  qty_delta numeric(18,6) NOT NULL CHECK (qty_delta <> 0),
  reason text NOT NULL CHECK (reason IN ('cycle_count', 'damage', 'expiry', 'theft', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, stock_adjustment_id)
    REFERENCES public.stock_adjustments(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.rfqs
  ADD CONSTRAINT rfqs_awarded_quote_fk
  FOREIGN KEY (company_id, awarded_quote_id)
  REFERENCES public.rfq_quotes(company_id, id)
  ON DELETE SET NULL;

ALTER TABLE public.rfqs
  ADD CONSTRAINT rfqs_award_po_fk
  FOREIGN KEY (company_id, award_po_id)
  REFERENCES public.purchase_orders(company_id, id)
  ON DELETE SET NULL;

CREATE TABLE public.document_links (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_doc_type text NOT NULL,
  from_doc_id text NOT NULL,
  from_line_id text,
  to_doc_type text NOT NULL,
  to_doc_id text NOT NULL,
  to_line_id text,
  qty numeric(18,6),
  value_amount numeric(18,3),
  value_currency text CHECK (value_currency IS NULL OR value_currency IN ('KWD', 'SAR', 'AED', 'USD')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE INDEX document_links_from_idx
  ON public.document_links(company_id, from_doc_type, from_doc_id);
CREATE INDEX document_links_to_idx
  ON public.document_links(company_id, to_doc_type, to_doc_id);

CREATE TABLE public.audit_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_id text NOT NULL,
  doc_type text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  "by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE INDEX audit_events_doc_idx
  ON public.audit_events(company_id, doc_type, doc_id, at);

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'purchase_requisitions', 'purchase_requisition_lines',
    'rfqs', 'rfq_sources', 'rfq_invited_suppliers', 'rfq_lines', 'rfq_quotes', 'rfq_quote_lines',
    'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'vendor_bills', 'vendor_bill_lines', 'vendor_payments', 'vendor_payment_allocations',
    'vendor_returns', 'vendor_return_lines', 'debit_notes',
    'opportunities', 'quotes', 'quote_lines', 'sales_orders', 'sales_order_lines',
    'delivery_notes', 'delivery_note_lines', 'customer_invoices', 'customer_invoice_lines',
    'customer_receipts', 'customer_receipt_allocations', 'customer_returns', 'customer_return_lines',
    'credit_notes', 'journal_entries', 'journal_entry_lines', 'stock_moves',
    'internal_transfers', 'internal_transfer_lines', 'stock_adjustments',
    'stock_adjustment_lines', 'document_links', 'audit_events'
  ]
  LOOP
    PERFORM public.apply_company_access(v_table);
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'purchase_requisitions', 'purchase_requisition_lines',
    'rfqs', 'rfq_lines', 'rfq_quotes', 'rfq_quote_lines',
    'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'vendor_bills', 'vendor_bill_lines', 'vendor_payments', 'vendor_returns',
    'vendor_return_lines', 'debit_notes', 'opportunities', 'quotes', 'quote_lines',
    'sales_orders', 'sales_order_lines', 'delivery_notes', 'delivery_note_lines',
    'customer_invoices', 'customer_invoice_lines', 'customer_receipts',
    'customer_returns', 'customer_return_lines', 'credit_notes', 'journal_entries',
    'journal_entry_lines', 'internal_transfers', 'internal_transfer_lines',
    'stock_adjustments', 'stock_adjustment_lines'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  END LOOP;
END;
$$;

-- Ledger and audit history are append-only to runtime callers. The posting
-- engine owns their writes through SECURITY DEFINER functions.
REVOKE UPDATE, DELETE ON public.journal_entries, public.journal_entry_lines,
  public.stock_moves, public.audit_events FROM authenticated;
