-- Reporting RPCs deliberately read only the posted ledger/documents. They
-- perform their own tenant authorization because SECURITY DEFINER bypasses RLS.

CREATE OR REPLACE FUNCTION public.report_trial_balance()
RETURNS TABLE (
  company_id text,
  account_id text,
  account_code text,
  account_name text,
  account_type text,
  debit numeric,
  credit numeric,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    a.company_id,
    a.id,
    a.code,
    a.name,
    a.type,
    coalesce(sum(jel.debit), 0)::numeric,
    coalesce(sum(jel.credit), 0)::numeric,
    (coalesce(sum(jel.debit), 0) - coalesce(sum(jel.credit), 0))::numeric
  FROM public.accounts AS a
  LEFT JOIN (
    public.journal_entry_lines AS jel
    INNER JOIN public.journal_entries AS je
      ON je.company_id = jel.company_id
      AND je.id = jel.journal_entry_id
      AND je.state = 'posted'
  )
    ON jel.company_id = a.company_id
    AND jel.account_id = a.id
  WHERE v_is_platform_admin OR a.company_id = v_company_id
  GROUP BY a.company_id, a.id, a.code, a.name, a.type
  ORDER BY a.company_id, a.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_ar_aging()
RETURNS TABLE (
  company_id text,
  customer_id text,
  customer_name text,
  invoice_id text,
  invoice_number text,
  invoice_date date,
  due_date date,
  currency text,
  total numeric,
  paid numeric,
  outstanding numeric,
  current_amount numeric,
  days_1_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_over_90 numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    ci.company_id,
    c.id,
    c.name,
    ci.id,
    ci.number,
    ci.date,
    ci.due_date,
    ci.currency,
    ci.total,
    ci.paid,
    (ci.total - ci.paid)::numeric,
    CASE WHEN ci.due_date >= current_date THEN (ci.total - ci.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - ci.due_date BETWEEN 1 AND 30 THEN (ci.total - ci.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - ci.due_date BETWEEN 31 AND 60 THEN (ci.total - ci.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - ci.due_date BETWEEN 61 AND 90 THEN (ci.total - ci.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - ci.due_date > 90 THEN (ci.total - ci.paid) ELSE 0 END::numeric
  FROM public.customer_invoices AS ci
  INNER JOIN public.customers AS c
    ON c.company_id = ci.company_id AND c.id = ci.customer_id
  WHERE ci.state = 'posted'
    AND ci.total > ci.paid
    AND (v_is_platform_admin OR ci.company_id = v_company_id)
  ORDER BY ci.company_id, c.name, ci.due_date, ci.number;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_ap_aging()
RETURNS TABLE (
  company_id text,
  supplier_id text,
  supplier_name text,
  bill_id text,
  bill_number text,
  invoice_number text,
  bill_date date,
  due_date date,
  currency text,
  total numeric,
  paid numeric,
  outstanding numeric,
  current_amount numeric,
  days_1_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_over_90 numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    vb.company_id,
    s.id,
    s.name,
    vb.id,
    vb.number,
    vb.invoice_number,
    vb.date,
    vb.due_date,
    vb.currency,
    vb.total,
    vb.paid,
    (vb.total - vb.paid)::numeric,
    CASE WHEN vb.due_date >= current_date THEN (vb.total - vb.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - vb.due_date BETWEEN 1 AND 30 THEN (vb.total - vb.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - vb.due_date BETWEEN 31 AND 60 THEN (vb.total - vb.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - vb.due_date BETWEEN 61 AND 90 THEN (vb.total - vb.paid) ELSE 0 END::numeric,
    CASE WHEN current_date - vb.due_date > 90 THEN (vb.total - vb.paid) ELSE 0 END::numeric
  FROM public.vendor_bills AS vb
  INNER JOIN public.suppliers AS s
    ON s.company_id = vb.company_id AND s.id = vb.supplier_id
  WHERE vb.state = 'posted'
    AND vb.total > vb.paid
    AND (v_is_platform_admin OR vb.company_id = v_company_id)
  ORDER BY vb.company_id, s.name, vb.due_date, vb.number;
END;
$$;

CREATE OR REPLACE FUNCTION public.item_snapshot(p_product_id text)
RETURNS TABLE (
  company_id text,
  product_id text,
  sku text,
  product_name text,
  uom text,
  costing_method text,
  on_hand numeric,
  inventory_value numeric,
  qty_on_purchase_orders numeric,
  qty_on_sales_orders numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    p.company_id,
    p.id,
    p.sku,
    p.name,
    p.uom,
    p.costing_method,
    coalesce(sm.on_hand, 0)::numeric,
    coalesce(sm.inventory_value, 0)::numeric,
    coalesce(po.open_qty, 0)::numeric,
    coalesce(so.open_qty, 0)::numeric
  FROM public.products AS p
  LEFT JOIN LATERAL (
    SELECT
      sum(CASE WHEN m.direction = 'in' THEN m.qty ELSE -m.qty END) AS on_hand,
      sum(CASE WHEN m.direction = 'in'
        THEN m.qty * m.cost_per_unit
        ELSE -m.qty * m.cost_per_unit
      END) AS inventory_value
    FROM public.stock_moves AS m
    WHERE m.company_id = p.company_id AND m.product_id = p.id
  ) AS sm ON true
  LEFT JOIN LATERAL (
    SELECT sum(pol.qty - pol.qty_received) AS open_qty
    FROM public.purchase_order_lines AS pol
    INNER JOIN public.purchase_orders AS po
      ON po.company_id = pol.company_id AND po.id = pol.purchase_order_id
    WHERE pol.company_id = p.company_id
      AND pol.product_id = p.id
      AND po.state IN ('confirmed', 'posted')
  ) AS po ON true
  LEFT JOIN LATERAL (
    SELECT sum(sol.qty - sol.qty_delivered) AS open_qty
    FROM public.sales_order_lines AS sol
    INNER JOIN public.sales_orders AS so
      ON so.company_id = sol.company_id AND so.id = sol.sales_order_id
    WHERE sol.company_id = p.company_id
      AND sol.product_id = p.id
      AND so.state IN ('confirmed', 'posted')
  ) AS so ON true
  WHERE p.id = p_product_id
    AND (v_is_platform_admin OR p.company_id = v_company_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.item_stock_by_warehouse(p_product_id text)
RETURNS TABLE (
  company_id text,
  product_id text,
  warehouse_id text,
  warehouse_code text,
  warehouse_name text,
  on_hand numeric,
  inventory_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
  v_product_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  SELECT p.company_id
  INTO v_product_company_id
  FROM public.products AS p
  WHERE p.id = p_product_id
    AND (v_is_platform_admin OR p.company_id = v_company_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    w.company_id,
    p_product_id,
    w.id,
    w.code,
    w.name,
    coalesce(sum(CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END), 0)::numeric,
    coalesce(sum(CASE WHEN sm.direction = 'in'
      THEN sm.qty * sm.cost_per_unit
      ELSE -sm.qty * sm.cost_per_unit
    END), 0)::numeric
  FROM public.warehouses AS w
  LEFT JOIN public.stock_moves AS sm
    ON sm.company_id = w.company_id
    AND sm.warehouse_id = w.id
    AND sm.product_id = p_product_id
  WHERE w.company_id = v_product_company_id
  GROUP BY w.company_id, w.id, w.code, w.name
  ORDER BY w.code;
END;
$$;

-- Use the fixed `simple` configuration so Arabic and mixed-language values are
-- preserved as tokens rather than being passed through English stemming.
CREATE INDEX products_search_simple_gin_idx ON public.products
  USING gin (to_tsvector('simple'::regconfig, coalesce(sku, '') || ' ' || coalesce(name, '')));
CREATE INDEX customers_search_simple_gin_idx ON public.customers
  USING gin (to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(vat_number, '')));
CREATE INDEX suppliers_search_simple_gin_idx ON public.suppliers
  USING gin (to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(vat_number, '')));
CREATE INDEX accounts_search_simple_gin_idx ON public.accounts
  USING gin (to_tsvector('simple'::regconfig, coalesce(code, '') || ' ' || coalesce(name, '')));
CREATE INDEX purchase_orders_search_simple_gin_idx ON public.purchase_orders
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX sales_orders_search_simple_gin_idx ON public.sales_orders
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(blocked_reason, '')));
CREATE INDEX vendor_bills_search_simple_gin_idx ON public.vendor_bills
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(invoice_number, '') || ' ' || coalesce(discrepancy_reason, '')));
CREATE INDEX customer_invoices_search_simple_gin_idx ON public.customer_invoices
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX journal_entries_search_simple_gin_idx ON public.journal_entries
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(description, '')));

CREATE OR REPLACE FUNCTION public.search_all(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  type text,
  id text,
  title text,
  subtitle text,
  rank real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
  v_query text := btrim(p_query);
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_tsquery tsquery;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF v_query IS NULL OR v_query = '' OR char_length(v_query) > 256 THEN
    RAISE EXCEPTION 'query must contain 1 to 256 characters';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  v_tsquery := websearch_to_tsquery('simple'::regconfig, v_query);
  IF v_tsquery = ''::tsquery THEN
    RAISE EXCEPTION 'query contains no searchable terms';
  END IF;

  RETURN QUERY
  SELECT results.type, results.id, results.title, results.subtitle, results.rank
  FROM (
    SELECT
      'product'::text AS type,
      p.id,
      p.sku || ' · ' || p.name AS title,
      'Product · ' || p.uom AS subtitle,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(p.sku, '') || ' ' || coalesce(p.name, '')),
        v_tsquery
      ) AS rank
    FROM public.products AS p
    WHERE to_tsvector('simple'::regconfig, coalesce(p.sku, '') || ' ' || coalesce(p.name, '')) @@ v_tsquery
      AND (v_is_platform_admin OR p.company_id = v_company_id)

    UNION ALL

    SELECT
      'customer'::text,
      c.id,
      c.name,
      'Customer' || CASE WHEN c.vat_number IS NULL THEN '' ELSE ' · ' || c.vat_number END,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(c.name, '') || ' ' || coalesce(c.vat_number, '')),
        v_tsquery
      )
    FROM public.customers AS c
    WHERE to_tsvector('simple'::regconfig, coalesce(c.name, '') || ' ' || coalesce(c.vat_number, '')) @@ v_tsquery
      AND (v_is_platform_admin OR c.company_id = v_company_id)

    UNION ALL

    SELECT
      'supplier'::text,
      s.id,
      s.name,
      'Supplier' || CASE WHEN s.vat_number IS NULL THEN '' ELSE ' · ' || s.vat_number END,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(s.name, '') || ' ' || coalesce(s.vat_number, '')),
        v_tsquery
      )
    FROM public.suppliers AS s
    WHERE to_tsvector('simple'::regconfig, coalesce(s.name, '') || ' ' || coalesce(s.vat_number, '')) @@ v_tsquery
      AND (v_is_platform_admin OR s.company_id = v_company_id)

    UNION ALL

    SELECT
      'account'::text,
      a.id,
      a.code || ' · ' || a.name,
      'Account · ' || a.type,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(a.code, '') || ' ' || coalesce(a.name, '')),
        v_tsquery
      )
    FROM public.accounts AS a
    WHERE to_tsvector('simple'::regconfig, coalesce(a.code, '') || ' ' || coalesce(a.name, '')) @@ v_tsquery
      AND (v_is_platform_admin OR a.company_id = v_company_id)

    UNION ALL

    SELECT
      'purchase_order'::text,
      po.id,
      po.number,
      'Purchase order · ' || po.state,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(po.number, '') || ' ' || coalesce(po.notes, '')),
        v_tsquery
      )
    FROM public.purchase_orders AS po
    WHERE to_tsvector('simple'::regconfig, coalesce(po.number, '') || ' ' || coalesce(po.notes, '')) @@ v_tsquery
      AND (v_is_platform_admin OR po.company_id = v_company_id)

    UNION ALL

    SELECT
      'sales_order'::text,
      so.id,
      so.number,
      'Sales order · ' || so.state,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(so.number, '') || ' ' || coalesce(so.blocked_reason, '')),
        v_tsquery
      )
    FROM public.sales_orders AS so
    WHERE to_tsvector('simple'::regconfig, coalesce(so.number, '') || ' ' || coalesce(so.blocked_reason, '')) @@ v_tsquery
      AND (v_is_platform_admin OR so.company_id = v_company_id)

    UNION ALL

    SELECT
      'vendor_bill'::text,
      vb.id,
      vb.number,
      'Vendor bill · ' || vb.invoice_number || ' · ' || vb.state,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(vb.number, '') || ' ' || coalesce(vb.invoice_number, '') || ' ' || coalesce(vb.discrepancy_reason, '')),
        v_tsquery
      )
    FROM public.vendor_bills AS vb
    WHERE to_tsvector('simple'::regconfig, coalesce(vb.number, '') || ' ' || coalesce(vb.invoice_number, '') || ' ' || coalesce(vb.discrepancy_reason, '')) @@ v_tsquery
      AND (v_is_platform_admin OR vb.company_id = v_company_id)

    UNION ALL

    SELECT
      'customer_invoice'::text,
      ci.id,
      ci.number,
      'Customer invoice · ' || ci.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(ci.number, '')), v_tsquery)
    FROM public.customer_invoices AS ci
    WHERE to_tsvector('simple'::regconfig, coalesce(ci.number, '')) @@ v_tsquery
      AND (v_is_platform_admin OR ci.company_id = v_company_id)

    UNION ALL

    SELECT
      'journal_entry'::text,
      je.id,
      je.number,
      'Journal entry · ' || je.state,
      ts_rank(
        to_tsvector('simple'::regconfig, coalesce(je.number, '') || ' ' || coalesce(je.description, '')),
        v_tsquery
      )
    FROM public.journal_entries AS je
    WHERE to_tsvector('simple'::regconfig, coalesce(je.number, '') || ' ' || coalesce(je.description, '')) @@ v_tsquery
      AND (v_is_platform_admin OR je.company_id = v_company_id)
  ) AS results
  ORDER BY results.rank DESC, results.title, results.id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.report_trial_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_ar_aging() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_ap_aging() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_snapshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_stock_by_warehouse(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_all(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.report_trial_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_ar_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_ap_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_snapshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_stock_by_warehouse(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_all(text, integer) TO authenticated;
