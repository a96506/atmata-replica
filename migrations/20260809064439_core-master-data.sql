-- Shared master/configuration models. Column names intentionally mirror the
-- TypeScript entity contract after the one snake_case <-> camelCase adapter.

CREATE TABLE public.currencies (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('KWD', 'SAR', 'AED', 'USD')),
  name text NOT NULL,
  symbol text NOT NULL,
  decimal_places smallint NOT NULL DEFAULT 3 CHECK (decimal_places BETWEEN 0 AND 6),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code)
);

CREATE TABLE public.branches (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, name)
);

CREATE TABLE public.warehouses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id text,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, branch_id)
    REFERENCES public.branches(company_id, id)
    ON DELETE SET NULL
);

CREATE TABLE public.locations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, warehouse_id, code),
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE public.tax_codes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('KW', 'SA', 'AE')),
  code text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  rate numeric(9,6) NOT NULL CHECK (rate BETWEEN 0 AND 1),
  is_input boolean NOT NULL DEFAULT false,
  is_output boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code)
);

CREATE TABLE public.payment_terms (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  net_days integer NOT NULL CHECK (net_days BETWEEN 0 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code)
);

CREATE TABLE public.bank_accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  iban text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  account_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, iban),
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.fiscal_periods (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  "start" date NOT NULL,
  "end" date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'soft_closed', 'hard_closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, year, month),
  CHECK ("end" >= "start")
);

CREATE TABLE public.accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, parent)
    REFERENCES public.accounts(company_id, id)
    ON DELETE SET NULL
);

ALTER TABLE public.bank_accounts
  ADD CONSTRAINT bank_accounts_company_account_fk
  FOREIGN KEY (company_id, account_id)
  REFERENCES public.accounts(company_id, id)
  ON DELETE SET NULL;

CREATE TABLE public.products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  uom text NOT NULL,
  tax_code_id text NOT NULL,
  costing_method text NOT NULL CHECK (costing_method IN ('FIFO', 'AVG', 'STD')),
  lot_tracked boolean NOT NULL DEFAULT false,
  purchasable boolean NOT NULL DEFAULT true,
  sellable boolean NOT NULL DEFAULT true,
  default_purchase_price numeric(18,3) NOT NULL DEFAULT 0 CHECK (default_purchase_price >= 0),
  default_sale_price numeric(18,3) NOT NULL DEFAULT 0 CHECK (default_sale_price >= 0),
  reorder_point numeric(18,6) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, sku),
  FOREIGN KEY (company_id, tax_code_id)
    REFERENCES public.tax_codes(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.customers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  vat_number text,
  credit_limit numeric(18,3) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  exposure numeric(18,3) NOT NULL DEFAULT 0 CHECK (exposure >= 0),
  payment_status text NOT NULL DEFAULT 'current'
    CHECK (payment_status IN ('current', 'overdue_14', 'on_hold')),
  credit_score text NOT NULL DEFAULT 'C' CHECK (credit_score IN ('A', 'B', 'C', 'D')),
  active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE TABLE public.suppliers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  vat_number text,
  bank_account text,
  payment_term_id text NOT NULL,
  wht_applicable boolean NOT NULL DEFAULT false,
  wht_rate numeric(9,6) CHECK (wht_rate IS NULL OR wht_rate BETWEEN 0 AND 1),
  active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, payment_term_id)
    REFERENCES public.payment_terms(company_id, id)
    ON DELETE RESTRICT,
  CHECK (NOT wht_applicable OR coalesce(wht_rate, 0.05) > 0)
);

CREATE TABLE public.fx_rates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  base_currency text NOT NULL CHECK (base_currency IN ('KWD', 'SAR', 'AED', 'USD')),
  quote_currency text NOT NULL CHECK (quote_currency IN ('KWD', 'SAR', 'AED', 'USD')),
  rate numeric(18,8) NOT NULL CHECK (rate > 0),
  rate_date date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, base_currency, quote_currency, rate_date),
  CHECK (base_currency <> quote_currency),
  FOREIGN KEY (company_id, base_currency)
    REFERENCES public.currencies(company_id, code),
  FOREIGN KEY (company_id, quote_currency)
    REFERENCES public.currencies(company_id, code)
);

CREATE TABLE public.price_lists (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('KWD', 'SAR', 'AED', 'USD')),
  active boolean NOT NULL DEFAULT true,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, name),
  FOREIGN KEY (company_id, currency)
    REFERENCES public.currencies(company_id, code),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE public.price_list_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id text NOT NULL,
  product_id text NOT NULL,
  unit_price numeric(18,3) NOT NULL CHECK (unit_price >= 0),
  min_qty numeric(18,6) NOT NULL DEFAULT 1 CHECK (min_qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, price_list_id, product_id, min_qty),
  FOREIGN KEY (company_id, price_list_id)
    REFERENCES public.price_lists(company_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.document_sequences (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'pr', 'rfq', 'po', 'grn', 'vendor_bill', 'vendor_payment', 'debit_note',
    'vendor_return', 'opportunity', 'quote', 'so', 'dn', 'customer_invoice',
    'customer_receipt', 'credit_note', 'customer_return', 'journal_entry',
    'stock_move', 'stock_adjustment', 'internal_transfer'
  )),
  prefix text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  padding smallint NOT NULL DEFAULT 5 CHECK (padding BETWEEN 1 AND 12),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, doc_type, year)
);

CREATE TABLE public.account_mappings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mapping_key text NOT NULL CHECK (mapping_key IN (
    'cash', 'bank', 'accounts_receivable', 'accounts_payable', 'inventory',
    'cogs', 'revenue', 'input_vat', 'output_vat', 'wht_payable',
    'inventory_adjustment', 'retained_earnings', 'depreciation_expense',
    'accumulated_depreciation', 'goods_received_not_invoiced'
  )),
  account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, mapping_key),
  FOREIGN KEY (company_id, account_id)
    REFERENCES public.accounts(company_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.approval_rules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  min_amount numeric(18,3) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  max_amount numeric(18,3),
  approver_roles text[] NOT NULL CHECK (cardinality(approver_roles) > 0),
  sequence smallint NOT NULL DEFAULT 1 CHECK (sequence > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CHECK (max_amount IS NULL OR max_amount >= min_amount)
);

CREATE OR REPLACE FUNCTION public.seed_company_defaults(
  p_company_id text,
  p_base_currency text,
  p_tax_profile text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year integer := extract(year FROM current_date);
BEGIN
  INSERT INTO public.currencies (id, company_id, code, name, symbol)
  VALUES
    ('cur-' || p_company_id || '-kwd', p_company_id, 'KWD', 'Kuwaiti Dinar', 'د.ك'),
    ('cur-' || p_company_id || '-sar', p_company_id, 'SAR', 'Saudi Riyal', 'ر.س'),
    ('cur-' || p_company_id || '-aed', p_company_id, 'AED', 'UAE Dirham', 'د.إ'),
    ('cur-' || p_company_id || '-usd', p_company_id, 'USD', 'US Dollar', '$')
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.tax_codes (
    id, company_id, jurisdiction, code, name_en, name_ar, rate, is_input, is_output
  )
  VALUES (
    'tax-' || p_company_id || '-standard',
    p_company_id,
    p_tax_profile,
    'STANDARD',
    'Standard VAT',
    'ضريبة القيمة المضافة',
    CASE p_tax_profile WHEN 'KW' THEN 0 ELSE 0.15 END,
    true,
    true
  )
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.payment_terms (id, company_id, code, name_en, name_ar, net_days)
  VALUES (
    'term-' || p_company_id || '-net30',
    p_company_id,
    'NET30',
    'Net 30',
    'صافي ٣٠ يوم',
    30
  )
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.branches (id, company_id, name)
  VALUES ('branch-' || p_company_id || '-main', p_company_id, 'Main')
  ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO public.warehouses (id, company_id, branch_id, code, name)
  VALUES (
    'wh-' || p_company_id || '-main',
    p_company_id,
    'branch-' || p_company_id || '-main',
    'MAIN',
    'Main warehouse'
  )
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.locations (id, company_id, warehouse_id, code, name)
  VALUES (
    'loc-' || p_company_id || '-main',
    p_company_id,
    'wh-' || p_company_id || '-main',
    'MAIN',
    'Main location'
  )
  ON CONFLICT (company_id, warehouse_id, code) DO NOTHING;

  INSERT INTO public.accounts (id, company_id, code, name, type)
  SELECT
    'acct-' || p_company_id || '-' || x.code,
    p_company_id,
    x.code,
    x.name,
    x.type
  FROM (
    VALUES
      ('1000', 'Cash', 'asset'),
      ('1010', 'Bank', 'asset'),
      ('1100', 'Accounts receivable', 'asset'),
      ('1200', 'Inventory', 'asset'),
      ('2000', 'Accounts payable', 'liability'),
      ('2100', 'VAT payable', 'liability'),
      ('2200', 'Withholding tax payable', 'liability'),
      ('2400', 'Goods received not invoiced (GRNI) - البضاعة المستلمة غير المفوترة', 'liability'),
      ('3000', 'Retained earnings', 'equity'),
      ('4000', 'Revenue', 'revenue'),
      ('5000', 'Cost of goods sold', 'expense'),
      ('5100', 'Input VAT', 'asset'),
      ('5200', 'Inventory adjustment', 'expense'),
      ('5300', 'Depreciation expense', 'expense'),
      ('2300', 'Accumulated depreciation', 'liability')
  ) AS x(code, name, type)
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.account_mappings (id, company_id, mapping_key, account_id)
  SELECT
    'map-' || p_company_id || '-' || x.mapping_key,
    p_company_id,
    x.mapping_key,
    'acct-' || p_company_id || '-' || x.account_code
  FROM (
    VALUES
      ('cash', '1000'),
      ('bank', '1010'),
      ('accounts_receivable', '1100'),
      ('accounts_payable', '2000'),
      ('inventory', '1200'),
      ('cogs', '5000'),
      ('revenue', '4000'),
      ('input_vat', '5100'),
      ('output_vat', '2100'),
      ('wht_payable', '2200'),
      ('inventory_adjustment', '5200'),
      ('retained_earnings', '3000'),
      ('depreciation_expense', '5300'),
      ('accumulated_depreciation', '2300'),
      ('goods_received_not_invoiced', '2400')
  ) AS x(mapping_key, account_code)
  ON CONFLICT (company_id, mapping_key) DO NOTHING;

  INSERT INTO public.document_sequences (
    id, company_id, doc_type, prefix, year, padding, next_number
  )
  SELECT
    'seq-' || p_company_id || '-' || x.doc_type || '-' || v_year,
    p_company_id,
    x.doc_type,
    x.prefix,
    v_year,
    x.padding,
    1
  FROM (
    VALUES
      ('pr', 'PR', 5), ('rfq', 'RFQ', 5), ('po', 'PO', 5), ('grn', 'GRN', 5),
      ('vendor_bill', 'BILL', 5), ('vendor_payment', 'VPAY', 5),
      ('debit_note', 'DBN', 5), ('vendor_return', 'VRET', 5),
      ('opportunity', 'OPP', 5), ('quote', 'QT', 5), ('so', 'SO', 5),
      ('dn', 'DEL', 5), ('customer_invoice', 'INV', 5),
      ('customer_receipt', 'RCP', 5), ('credit_note', 'CRN', 5),
      ('customer_return', 'CRET', 5), ('journal_entry', 'JE', 5),
      ('stock_move', 'SM', 6), ('stock_adjustment', 'ADJ', 5),
      ('internal_transfer', 'TRX', 5)
  ) AS x(doc_type, prefix, padding)
  ON CONFLICT (company_id, doc_type, year) DO NOTHING;

  INSERT INTO public.fiscal_periods (
    id, company_id, year, month, "start", "end", status
  )
  SELECT
    'period-' || p_company_id || '-' || v_year || '-' || lpad(gs.month_no::text, 2, '0'),
    p_company_id,
    v_year,
    gs.month_no,
    make_date(v_year, gs.month_no, 1),
    (make_date(v_year, gs.month_no, 1) + interval '1 month - 1 day')::date,
    'open'
  FROM generate_series(1, 12) AS gs(month_no)
  ON CONFLICT (company_id, year, month) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_company(
  p_name text,
  p_base_currency text,
  p_tax_profile text,
  p_owner_id uuid,
  p_owner_email text,
  p_owner_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  INSERT INTO public.companies (name, base_currency, tax_profile)
  VALUES (trim(p_name), p_base_currency, p_tax_profile)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (p_owner_id, trim(p_owner_name), lower(trim(p_owner_email)))
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        active = true;

  INSERT INTO public.company_members (company_id, user_id, roles, is_owner)
  VALUES (v_company_id, p_owner_id, ARRAY['admin']::text[], true);

  PERFORM public.seed_company_defaults(v_company_id, p_base_currency, p_tax_profile);
  RETURN v_company_id;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'currencies', 'branches', 'warehouses', 'locations', 'tax_codes',
    'payment_terms', 'bank_accounts', 'fiscal_periods', 'accounts', 'products',
    'customers', 'suppliers', 'fx_rates', 'price_lists', 'price_list_items',
    'document_sequences', 'account_mappings', 'approval_rules'
  ]
  LOOP
    PERFORM public.apply_company_access(v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_company_defaults(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_company_defaults(text, text, text) TO project_admin;
