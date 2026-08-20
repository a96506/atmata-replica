-- Phase 2 read-contract prerequisites.
-- Adds deterministic child-line ordering, RFQ line lineage, Product 360 RPCs,
-- and complete tenant-scoped database search. No application read wiring is
-- included in this migration.

-- ---------------------------------------------------------------------------
-- Stable line ordering
-- ---------------------------------------------------------------------------
-- Existing rows are ordered by creation time and then primary key. The primary
-- key tie-breaker makes the backfill deterministic even when seeded rows share
-- a transaction timestamp.
DO $$
DECLARE
  v_table text;
  v_parent text;
BEGIN
  FOR v_table, v_parent IN
    SELECT *
    FROM (VALUES
      ('purchase_requisition_lines', 'purchase_requisition_id'),
      ('rfq_lines', 'rfq_id'),
      ('rfq_quote_lines', 'rfq_quote_id'),
      ('purchase_order_lines', 'purchase_order_id'),
      ('goods_receipt_lines', 'goods_receipt_id'),
      ('vendor_bill_lines', 'vendor_bill_id'),
      ('vendor_return_lines', 'vendor_return_id'),
      ('quote_lines', 'quote_id'),
      ('sales_order_lines', 'sales_order_id'),
      ('delivery_note_lines', 'delivery_note_id'),
      ('customer_invoice_lines', 'customer_invoice_id'),
      ('customer_return_lines', 'customer_return_id'),
      ('journal_entry_lines', 'journal_entry_id'),
      ('internal_transfer_lines', 'internal_transfer_id'),
      ('stock_adjustment_lines', 'stock_adjustment_id')
    ) AS line_table(table_name, parent_column)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN line_order integer',
      v_table
    );

    EXECUTE format(
      'WITH ranked AS ('
      || ' SELECT id, row_number() OVER ('
      || '   PARTITION BY company_id, %I ORDER BY created_at, id'
      || ' )::integer AS position'
      || ' FROM public.%I'
      || ')'
      || ' UPDATE public.%I AS target'
      || ' SET line_order = ranked.position'
      || ' FROM ranked'
      || ' WHERE target.id = ranked.id',
      v_parent,
      v_table,
      v_table
    );

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN line_order SET NOT NULL',
      v_table
    );

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (company_id, %I, line_order)',
      v_table,
      v_table || '_parent_line_order_key',
      v_parent
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- RFQ line-level lineage
-- ---------------------------------------------------------------------------
CREATE TABLE public.rfq_line_sources (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_line_id text NOT NULL,
  purchase_requisition_line_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, rfq_line_id, purchase_requisition_line_id),
  FOREIGN KEY (company_id, rfq_line_id)
    REFERENCES public.rfq_lines(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, purchase_requisition_line_id)
    REFERENCES public.purchase_requisition_lines(company_id, id) ON DELETE RESTRICT
);

-- Recover lineage for existing RFQs only from an explicit RFQ-to-PR source and
-- a single exact product match. Ambiguous historical matches remain unlinked
-- rather than manufacturing lineage across same-product PR lines.
INSERT INTO public.rfq_line_sources (
  company_id,
  rfq_line_id,
  purchase_requisition_line_id
)
WITH candidates AS (
  SELECT
    rl.company_id,
    rl.id AS rfq_line_id,
    prl.id AS purchase_requisition_line_id,
    count(*) OVER (
      PARTITION BY rl.company_id, rl.id
    ) AS candidate_count
  FROM public.rfq_lines AS rl
  INNER JOIN public.rfq_sources AS rs
    ON rs.company_id = rl.company_id
    AND rs.rfq_id = rl.rfq_id
  INNER JOIN public.purchase_requisition_lines AS prl
    ON prl.company_id = rs.company_id
    AND prl.purchase_requisition_id = rs.purchase_requisition_id
    AND prl.product_id = rl.product_id
)
SELECT
  candidates.company_id,
  candidates.rfq_line_id,
  candidates.purchase_requisition_line_id
FROM candidates
WHERE candidates.candidate_count = 1
ON CONFLICT (company_id, rfq_line_id, purchase_requisition_line_id) DO NOTHING;

SELECT public.apply_company_access('rfq_line_sources');
REVOKE ALL ON TABLE public.rfq_line_sources FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rfq_line_sources TO authenticated;

CREATE INDEX rfq_line_sources_rfq_line_idx
  ON public.rfq_line_sources(company_id, rfq_line_id);
CREATE INDEX rfq_line_sources_pr_line_idx
  ON public.rfq_line_sources(company_id, purchase_requisition_line_id);

-- The reviewed M1-M12 company-table allowlist baseline is 77.
-- rfq_line_sources is the read-contracts +1 (future reviewed total: 78).
-- No schema-manifest object exists in the current repository, so this migration
-- records the increment here instead of inventing a competing manifest.

-- ---------------------------------------------------------------------------
-- Product 360
-- ---------------------------------------------------------------------------
-- PostgreSQL cannot replace a function while changing its OUT row type.
DROP FUNCTION public.item_snapshot(text);
DROP FUNCTION public.item_stock_by_warehouse(text);

CREATE FUNCTION public.item_snapshot(p_product_id text)
RETURNS TABLE (
  product_id text,
  sku text,
  name text,
  uom text,
  costing_method text,
  lot_tracked boolean,
  on_hand numeric,
  last_cost numeric,
  last_sale_price numeric,
  open_po_lines integer,
  open_so_lines integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.sku,
    p.name,
    p.uom,
    p.costing_method,
    p.lot_tracked,
    coalesce(stock.on_hand, 0)::numeric,
    last_in.cost_per_unit,
    last_sale.unit_price,
    coalesce(open_po.line_count, 0)::integer,
    coalesce(open_so.line_count, 0)::integer
  FROM public.products AS p
  LEFT JOIN LATERAL (
    SELECT sum(
      CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END
    ) AS on_hand
    FROM public.stock_moves AS sm
    WHERE sm.company_id = p.company_id
      AND sm.product_id = p.id
  ) AS stock ON true
  LEFT JOIN LATERAL (
    SELECT sm.cost_per_unit
    FROM public.stock_moves AS sm
    WHERE sm.company_id = p.company_id
      AND sm.product_id = p.id
      AND sm.direction = 'in'
    ORDER BY sm.date DESC, sm.created_at DESC, sm.id DESC
    LIMIT 1
  ) AS last_in ON true
  LEFT JOIN LATERAL (
    SELECT cil.unit_price
    FROM public.customer_invoice_lines AS cil
    INNER JOIN public.customer_invoices AS ci
      ON ci.company_id = cil.company_id
      AND ci.id = cil.customer_invoice_id
    WHERE cil.company_id = p.company_id
      AND cil.product_id = p.id
    ORDER BY ci.date DESC, ci.id DESC, cil.line_order DESC, cil.id DESC
    LIMIT 1
  ) AS last_sale ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS line_count
    FROM public.purchase_order_lines AS pol
    INNER JOIN public.purchase_orders AS po
      ON po.company_id = pol.company_id
      AND po.id = pol.purchase_order_id
    WHERE pol.company_id = p.company_id
      AND pol.product_id = p.id
      AND po.state IN ('confirmed', 'posted')
      AND pol.qty_received < pol.qty
  ) AS open_po ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS line_count
    FROM public.sales_order_lines AS sol
    INNER JOIN public.sales_orders AS so
      ON so.company_id = sol.company_id
      AND so.id = sol.sales_order_id
    WHERE sol.company_id = p.company_id
      AND sol.product_id = p.id
      AND so.state IN ('confirmed', 'posted')
      AND sol.qty_delivered < sol.qty
  ) AS open_so ON true
  WHERE p.company_id = v_company_id
    AND p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found';
  END IF;
END;
$$;

CREATE FUNCTION public.item_stock_by_warehouse(p_product_id text)
RETURNS TABLE (
  warehouse_id text,
  warehouse_name text,
  on_hand numeric,
  in_moves integer,
  out_moves integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products AS p
    WHERE p.company_id = v_company_id
      AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    coalesce(sum(
      CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END
    ), 0)::numeric AS on_hand,
    count(sm.id) FILTER (WHERE sm.direction = 'in')::integer AS in_moves,
    count(sm.id) FILTER (WHERE sm.direction = 'out')::integer AS out_moves
  FROM public.warehouses AS w
  LEFT JOIN public.stock_moves AS sm
    ON sm.company_id = w.company_id
    AND sm.warehouse_id = w.id
    AND sm.product_id = p_product_id
  WHERE w.company_id = v_company_id
  GROUP BY w.id, w.name
  ORDER BY 3 DESC, w.name, w.id;
END;
$$;

CREATE FUNCTION public.item_moves(p_product_id text)
RETURNS TABLE (
  id text,
  date date,
  warehouse_id text,
  warehouse_name text,
  direction text,
  qty numeric,
  cost_per_unit numeric,
  source_type text,
  source_id text,
  lot_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    sm.id,
    sm.date,
    w.id,
    w.name,
    sm.direction,
    sm.qty,
    sm.cost_per_unit,
    sm.source_type,
    sm.source_id,
    sm.lot_number
  FROM public.stock_moves AS sm
  INNER JOIN public.warehouses AS w
    ON w.company_id = sm.company_id
    AND w.id = sm.warehouse_id
  WHERE sm.company_id = v_company_id
    AND sm.product_id = p_product_id
  ORDER BY sm.date DESC, sm.created_at DESC, sm.id DESC;
END;
$$;

CREATE FUNCTION public.item_lots(p_product_id text)
RETURNS TABLE (
  lot_number text,
  by_warehouse jsonb,
  total_on_hand numeric,
  first_seen date,
  last_seen date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  WITH warehouse_totals AS (
    SELECT
      sm.lot_number,
      w.id AS warehouse_id,
      w.name AS warehouse_name,
      sum(CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END)::numeric AS on_hand,
      min(sm.date) AS first_seen,
      max(sm.date) AS last_seen
    FROM public.stock_moves AS sm
    INNER JOIN public.warehouses AS w
      ON w.company_id = sm.company_id
      AND w.id = sm.warehouse_id
    WHERE sm.company_id = v_company_id
      AND sm.product_id = p_product_id
      AND sm.lot_number IS NOT NULL
    GROUP BY sm.lot_number, w.id, w.name
  )
  SELECT
    wt.lot_number,
    jsonb_agg(
      jsonb_build_object(
        'warehouse_id', wt.warehouse_id,
        'warehouse_name', wt.warehouse_name,
        'on_hand', wt.on_hand
      )
      ORDER BY wt.warehouse_name, wt.warehouse_id
    ),
    sum(wt.on_hand)::numeric,
    min(wt.first_seen),
    max(wt.last_seen)
  FROM warehouse_totals AS wt
  GROUP BY wt.lot_number
  ORDER BY wt.lot_number;
END;
$$;

CREATE FUNCTION public.item_purchase_history(p_product_id text)
RETURNS TABLE (
  doc_id text,
  doc_number text,
  date date,
  supplier_id text,
  supplier_name text,
  qty numeric,
  unit_price numeric,
  total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    po.id,
    po.number,
    po.date,
    s.id,
    s.name,
    pol.qty,
    pol.unit_price,
    (pol.qty * pol.unit_price)::numeric
  FROM public.purchase_order_lines AS pol
  INNER JOIN public.purchase_orders AS po
    ON po.company_id = pol.company_id
    AND po.id = pol.purchase_order_id
  INNER JOIN public.suppliers AS s
    ON s.company_id = po.company_id
    AND s.id = po.supplier_id
  WHERE pol.company_id = v_company_id
    AND pol.product_id = p_product_id
  ORDER BY po.date, po.number, po.id, pol.line_order, pol.id;
END;
$$;

CREATE FUNCTION public.item_sales_history(p_product_id text)
RETURNS TABLE (
  doc_id text,
  doc_number text,
  date date,
  customer_id text,
  customer_name text,
  qty numeric,
  unit_price numeric,
  total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    ci.id,
    ci.number,
    ci.date,
    c.id,
    c.name,
    cil.qty,
    cil.unit_price,
    (cil.qty * cil.unit_price)::numeric
  FROM public.customer_invoice_lines AS cil
  INNER JOIN public.customer_invoices AS ci
    ON ci.company_id = cil.company_id
    AND ci.id = cil.customer_invoice_id
  INNER JOIN public.customers AS c
    ON c.company_id = ci.company_id
    AND c.id = ci.customer_id
  WHERE cil.company_id = v_company_id
    AND cil.product_id = p_product_id
  ORDER BY ci.date, ci.number, ci.id, cil.line_order, cil.id;
END;
$$;

CREATE FUNCTION public.item_vendors(p_product_id text)
RETURNS TABLE (
  supplier_id text,
  supplier_name text,
  qty numeric,
  value numeric,
  last_price numeric,
  po_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    sum(pol.qty)::numeric,
    sum(pol.qty * pol.unit_price)::numeric,
    (array_agg(
      pol.unit_price
      ORDER BY po.date DESC, po.id DESC, pol.line_order DESC, pol.id DESC
    ))[1]::numeric,
    count(DISTINCT po.id)::integer
  FROM public.purchase_order_lines AS pol
  INNER JOIN public.purchase_orders AS po
    ON po.company_id = pol.company_id
    AND po.id = pol.purchase_order_id
  INNER JOIN public.suppliers AS s
    ON s.company_id = po.company_id
    AND s.id = po.supplier_id
  WHERE pol.company_id = v_company_id
    AND pol.product_id = p_product_id
  GROUP BY s.id, s.name
  ORDER BY sum(pol.qty * pol.unit_price) DESC, s.name, s.id;
END;
$$;

CREATE FUNCTION public.item_customers(p_product_id text)
RETURNS TABLE (
  customer_id text,
  customer_name text,
  qty numeric,
  value numeric,
  last_price numeric,
  invoice_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    WHERE p.company_id = v_company_id AND p.id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    sum(cil.qty)::numeric,
    sum(cil.qty * cil.unit_price)::numeric,
    (array_agg(
      cil.unit_price
      ORDER BY ci.date DESC, ci.id DESC, cil.line_order DESC, cil.id DESC
    ))[1]::numeric,
    count(DISTINCT ci.id)::integer
  FROM public.customer_invoice_lines AS cil
  INNER JOIN public.customer_invoices AS ci
    ON ci.company_id = cil.company_id
    AND ci.id = cil.customer_invoice_id
  INNER JOIN public.customers AS c
    ON c.company_id = ci.company_id
    AND c.id = ci.customer_id
  WHERE cil.company_id = v_company_id
    AND cil.product_id = p_product_id
  GROUP BY c.id, c.name
  ORDER BY sum(cil.qty * cil.unit_price) DESC, c.name, c.id;
END;
$$;

CREATE INDEX stock_moves_item_history_idx
  ON public.stock_moves(company_id, product_id, date DESC, id DESC);
CREATE INDEX purchase_order_lines_item_idx
  ON public.purchase_order_lines(company_id, product_id, purchase_order_id);
CREATE INDEX sales_order_lines_item_idx
  ON public.sales_order_lines(company_id, product_id, sales_order_id);
CREATE INDEX customer_invoice_lines_item_idx
  ON public.customer_invoice_lines(company_id, product_id, customer_invoice_id);

-- ---------------------------------------------------------------------------
-- Complete tenant-scoped global search
-- ---------------------------------------------------------------------------
CREATE INDEX purchase_requisitions_search_simple_gin_idx ON public.purchase_requisitions
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX rfqs_search_simple_gin_idx ON public.rfqs
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX goods_receipts_search_simple_gin_idx ON public.goods_receipts
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX vendor_payments_search_simple_gin_idx ON public.vendor_payments
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX vendor_returns_search_simple_gin_idx ON public.vendor_returns
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX debit_notes_search_simple_gin_idx ON public.debit_notes
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX quotes_search_simple_gin_idx ON public.quotes
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX delivery_notes_search_simple_gin_idx ON public.delivery_notes
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX customer_receipts_search_simple_gin_idx ON public.customer_receipts
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX customer_returns_search_simple_gin_idx ON public.customer_returns
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX credit_notes_search_simple_gin_idx ON public.credit_notes
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '')));
CREATE INDEX stock_moves_search_simple_gin_idx ON public.stock_moves
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(source_type, '') || ' ' || coalesce(source_id, '') || ' ' || coalesce(lot_number, '')));
CREATE INDEX internal_transfers_search_simple_gin_idx ON public.internal_transfers
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));
CREATE INDEX stock_adjustments_search_simple_gin_idx ON public.stock_adjustments
  USING gin (to_tsvector('simple'::regconfig, coalesce(number, '') || ' ' || coalesce(notes, '')));

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
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
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

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  v_tsquery := websearch_to_tsquery('simple'::regconfig, v_query);
  IF v_tsquery = ''::tsquery THEN
    RAISE EXCEPTION 'query contains no searchable terms';
  END IF;

  RETURN QUERY
  WITH results AS (
    SELECT 'product'::text AS type, p.id,
      p.sku || ' · ' || p.name AS title,
      'Product · ' || p.uom AS subtitle,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(p.sku, '') || ' ' || coalesce(p.name, '')), v_tsquery) AS rank
    FROM public.products AS p
    WHERE p.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(p.sku, '') || ' ' || coalesce(p.name, '')) @@ v_tsquery

    UNION ALL
    SELECT 'customer', c.id, c.name,
      'Customer' || CASE WHEN c.vat_number IS NULL THEN '' ELSE ' · ' || c.vat_number END,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(c.name, '') || ' ' || coalesce(c.vat_number, '')), v_tsquery)
    FROM public.customers AS c
    WHERE c.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(c.name, '') || ' ' || coalesce(c.vat_number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'supplier', s.id, s.name,
      'Supplier' || CASE WHEN s.vat_number IS NULL THEN '' ELSE ' · ' || s.vat_number END,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(s.name, '') || ' ' || coalesce(s.vat_number, '')), v_tsquery)
    FROM public.suppliers AS s
    WHERE s.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(s.name, '') || ' ' || coalesce(s.vat_number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'account', a.id, a.code || ' · ' || a.name, 'Account · ' || a.type,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(a.code, '') || ' ' || coalesce(a.name, '')), v_tsquery)
    FROM public.accounts AS a
    WHERE a.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(a.code, '') || ' ' || coalesce(a.name, '')) @@ v_tsquery

    UNION ALL
    SELECT 'purchase_requisition', d.id, d.number, 'Purchase requisition · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.purchase_requisitions AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'rfq', d.id, d.number, 'RFQ · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.rfqs AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'purchase_order', d.id, d.number, 'Purchase order · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.purchase_orders AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'goods_receipt', d.id, d.number, 'Goods receipt · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.goods_receipts AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'vendor_bill', d.id, d.number,
      'Vendor bill · ' || d.invoice_number || ' · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.invoice_number, '') || ' ' || coalesce(d.discrepancy_reason, '')), v_tsquery)
    FROM public.vendor_bills AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.invoice_number, '') || ' ' || coalesce(d.discrepancy_reason, '')) @@ v_tsquery

    UNION ALL
    SELECT 'vendor_payment', d.id, d.number, 'Vendor payment · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.vendor_payments AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'vendor_return', d.id, d.number, 'Vendor return · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.vendor_returns AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'debit_note', d.id, d.number, 'Debit note · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.debit_notes AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'quote', d.id, d.number, 'Quote · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.quotes AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'sales_order', d.id, d.number, 'Sales order · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.blocked_reason, '')), v_tsquery)
    FROM public.sales_orders AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.blocked_reason, '')) @@ v_tsquery

    UNION ALL
    SELECT 'delivery_note', d.id, d.number, 'Delivery note · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.delivery_notes AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'customer_invoice', d.id, d.number, 'Customer invoice · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.customer_invoices AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'customer_receipt', d.id, d.number, 'Customer receipt · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.customer_receipts AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'customer_return', d.id, d.number, 'Customer return · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.customer_returns AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'credit_note', d.id, d.number, 'Credit note · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '')), v_tsquery)
    FROM public.credit_notes AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'journal_entry', d.id, d.number, 'Journal entry · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.description, '')), v_tsquery)
    FROM public.journal_entries AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.description, '')) @@ v_tsquery

    UNION ALL
    SELECT 'stock_move', d.id, d.number, 'Stock move · ' || d.direction,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.source_type, '') || ' ' || coalesce(d.source_id, '') || ' ' || coalesce(d.lot_number, '')), v_tsquery)
    FROM public.stock_moves AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.source_type, '') || ' ' || coalesce(d.source_id, '') || ' ' || coalesce(d.lot_number, '')) @@ v_tsquery

    UNION ALL
    SELECT 'internal_transfer', d.id, d.number, 'Internal transfer · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.internal_transfers AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery

    UNION ALL
    SELECT 'stock_adjustment', d.id, d.number, 'Stock adjustment · ' || d.state,
      ts_rank(to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')), v_tsquery)
    FROM public.stock_adjustments AS d
    WHERE d.company_id = v_company_id
      AND to_tsvector('simple'::regconfig, coalesce(d.number, '') || ' ' || coalesce(d.notes, '')) @@ v_tsquery
  )
  SELECT results.type, results.id, results.title, results.subtitle, results.rank
  FROM results
  ORDER BY results.rank DESC, results.title, results.type, results.id
  LIMIT v_limit;
END;
$$;

-- All read-contract functions are callable only by authenticated sessions.
REVOKE ALL ON FUNCTION public.item_snapshot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_stock_by_warehouse(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_moves(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_lots(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_purchase_history(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_sales_history(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_vendors(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.item_customers(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_all(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.item_snapshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_stock_by_warehouse(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_moves(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_lots(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_purchase_history(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_sales_history(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_vendors(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_customers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_all(text, integer) TO authenticated;

-- Nullability is intentionally unchanged. In particular, journal source fields,
-- audit actor IDs, lot numbers, and optional document fields remain nullable
-- where system-generated or legitimate domain rows can omit them. Phase 3 must
-- align TypeScript contracts instead of imposing unsafe database NOT NULLs.
