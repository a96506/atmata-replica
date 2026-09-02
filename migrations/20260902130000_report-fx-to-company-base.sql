-- Convert report amounts to company base currency via fx_rates (LATERAL latest-as-of).
-- Stop relying on a hardcoded display currency; RPCs emit currency = companies.base_currency.
-- Pattern: https://stackoverflow.com/questions/74709585/sql-join-on-the-nearest-less-date

CREATE OR REPLACE FUNCTION public.fx_to_company_base(
  p_company_id text,
  p_amount numeric,
  p_from_currency text,
  p_as_of date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_base text;
  v_rate numeric;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN coalesce(p_amount, 0);
  END IF;

  SELECT c.base_currency INTO v_base
  FROM public.companies AS c
  WHERE c.id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company % not found', p_company_id;
  END IF;

  IF p_from_currency IS NULL OR p_from_currency = v_base THEN
    RETURN p_amount;
  END IF;

  -- Direct pair: 1 from = rate base
  SELECT fr.rate INTO v_rate
  FROM public.fx_rates AS fr
  WHERE fr.company_id = p_company_id
    AND fr.base_currency = p_from_currency
    AND fr.quote_currency = v_base
    AND fr.rate_date <= p_as_of
  ORDER BY fr.rate_date DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN round(p_amount * v_rate, 3);
  END IF;

  -- Inverse of ingest shape (base=company, quote=foreign): 1 base = rate foreign
  SELECT fr.rate INTO v_rate
  FROM public.fx_rates AS fr
  WHERE fr.company_id = p_company_id
    AND fr.base_currency = v_base
    AND fr.quote_currency = p_from_currency
    AND fr.rate_date <= p_as_of
  ORDER BY fr.rate_date DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN round(p_amount / v_rate, 3);
  END IF;

  -- No rate as of date: leave amount unchanged (same fallback as getFxRate TS).
  RETURN p_amount;
END;
$$;

ALTER FUNCTION public.fx_to_company_base(text, numeric, text, date) SET search_path = '';
REVOKE ALL ON FUNCTION public.fx_to_company_base(text, numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_to_company_base(text, numeric, text, date) TO authenticated, project_admin;

CREATE OR REPLACE FUNCTION public.report_pnl(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
  v_base text;
  v_revenue numeric;
  v_cogs numeric;
  v_opex numeric;
  v_gross numeric;
  v_op_income numeric;
  v_net numeric;
BEGIN
  SELECT * INTO v_period FROM public.fiscal_periods
  WHERE id = p_period_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'period % not found for company', p_period_id;
  END IF;

  SELECT c.base_currency INTO v_base
  FROM public.companies AS c WHERE c.id = v_company_id;

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_revenue
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'revenue'
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_cogs
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'expense'
    AND a.code LIKE '5%'
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_opex
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'expense'
    AND a.code NOT LIKE '5%'
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  v_gross := v_revenue - v_cogs;
  v_op_income := v_gross - v_opex;
  v_net := v_op_income;

  RETURN jsonb_build_object(
    'currency', v_base,
    'line_items', jsonb_build_array(
      jsonb_build_object('label', 'Revenue', 'amount', v_revenue),
      jsonb_build_object('label', 'Cost of sales', 'amount', -v_cogs),
      jsonb_build_object('label', 'Gross profit', 'amount', v_gross),
      jsonb_build_object('label', 'Operating expenses', 'amount', -v_opex),
      jsonb_build_object('label', 'Operating income', 'amount', v_op_income),
      jsonb_build_object('label', 'Net income', 'amount', v_net)
    ),
    'totals', jsonb_build_object(
      'revenue', v_revenue,
      'gross_profit', v_gross,
      'operating_income', v_op_income,
      'net_income', v_net
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_balance_sheet(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
  v_base text;
  v_assets numeric;
  v_liabilities numeric;
  v_equity numeric;
  v_net_income numeric;
  v_total_equity numeric;
  v_total_le numeric;
BEGIN
  SELECT * INTO v_period FROM public.fiscal_periods
  WHERE id = p_period_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'period % not found for company', p_period_id;
  END IF;

  SELECT c.base_currency INTO v_base
  FROM public.companies AS c WHERE c.id = v_company_id;

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_assets
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'asset'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_liabilities
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'liability'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_equity
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'equity'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        (l.debit - l.credit) * a.report_sign,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_net_income
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type IN ('revenue', 'expense')
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  v_total_equity := v_equity + v_net_income;
  v_total_le := v_liabilities + v_total_equity;

  RETURN jsonb_build_object(
    'currency', v_base,
    'line_items', jsonb_build_array(
      jsonb_build_object('label', 'Total assets', 'amount', v_assets),
      jsonb_build_object('label', 'Total liabilities', 'amount', v_liabilities),
      jsonb_build_object('label', 'Total equity', 'amount', v_total_equity),
      jsonb_build_object('label', 'Retained earnings (current period)', 'amount', v_net_income),
      jsonb_build_object('label', 'Total liabilities and equity', 'amount', v_total_le)
    ),
    'totals', jsonb_build_object(
      'assets', v_assets,
      'liabilities', v_liabilities,
      'equity', v_equity,
      'retained_earnings', v_net_income,
      'total_liabilities_equity', v_total_le
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_cash_flow(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
  v_base text;
  v_beginning numeric;
  v_change numeric;
  v_ending numeric;
BEGIN
  SELECT * INTO v_period FROM public.fiscal_periods
  WHERE id = p_period_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'period % not found for company', p_period_id;
  END IF;

  SELECT c.base_currency INTO v_base
  FROM public.companies AS c WHERE c.id = v_company_id;

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        l.debit - l.credit,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_beginning
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.is_cash
    AND e.date < v_period."start"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(
      public.fx_to_company_base(
        l.company_id,
        l.debit - l.credit,
        e.currency,
        e.date
      )
    ), 0)
    INTO v_change
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.is_cash
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  v_ending := v_beginning + v_change;

  RETURN jsonb_build_object(
    'currency', v_base,
    'line_items', jsonb_build_array(
      jsonb_build_object('label', 'Beginning cash', 'amount', v_beginning),
      jsonb_build_object('label', 'Net cash movement', 'amount', v_change),
      jsonb_build_object('label', 'Ending cash', 'amount', v_ending)
    ),
    'totals', jsonb_build_object(
      'beginning', v_beginning,
      'net_change', v_change,
      'ending', v_ending
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_trial_balance(
  p_period_id text DEFAULT NULL,
  p_account_id text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
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
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
  v_period public.fiscal_periods%ROWTYPE;
  v_account public.accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF p_period_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.fiscal_periods
    WHERE id = p_period_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'period % not found', p_period_id;
    END IF;
    IF NOT v_is_platform_admin AND v_period.company_id <> v_company_id THEN
      RAISE EXCEPTION 'period % not found for company', p_period_id;
    END IF;
  END IF;

  IF p_account_id IS NOT NULL THEN
    SELECT * INTO v_account FROM public.accounts
    WHERE id = p_account_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'account % not found', p_account_id;
    END IF;
    IF NOT v_is_platform_admin AND v_account.company_id <> v_company_id THEN
      RAISE EXCEPTION 'account % not found for company', p_account_id;
    END IF;
  END IF;

  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'p_from must be on or before p_to';
  END IF;

  RETURN QUERY
  SELECT
    a.company_id,
    a.id,
    a.code,
    a.name,
    a.type,
    coalesce(sum(
      public.fx_to_company_base(a.company_id, jel.debit, je.currency, je.date)
    ), 0)::numeric,
    coalesce(sum(
      public.fx_to_company_base(a.company_id, jel.credit, je.currency, je.date)
    ), 0)::numeric,
    (
      coalesce(sum(
        public.fx_to_company_base(a.company_id, jel.debit, je.currency, je.date)
      ), 0)
      - coalesce(sum(
        public.fx_to_company_base(a.company_id, jel.credit, je.currency, je.date)
      ), 0)
    )::numeric
  FROM public.accounts AS a
  LEFT JOIN (
    public.journal_entry_lines AS jel
    INNER JOIN public.journal_entries AS je
      ON je.company_id = jel.company_id
      AND je.id = jel.journal_entry_id
      AND je.state = 'posted'
      AND (
        p_period_id IS NULL
        OR (je.date >= v_period."start" AND je.date <= v_period."end")
      )
      AND (p_from IS NULL OR je.date >= p_from)
      AND (p_to IS NULL OR je.date <= p_to)
  )
    ON jel.company_id = a.company_id
    AND jel.account_id = a.id
  WHERE (v_is_platform_admin OR a.company_id = v_company_id)
    AND (p_account_id IS NULL OR a.id = p_account_id)
  GROUP BY a.company_id, a.id, a.code, a.name, a.type
  ORDER BY a.company_id, a.code;
END;
$$;

ALTER FUNCTION public.report_trial_balance(text, text, date, date) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_trial_balance(text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_trial_balance(text, text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_general_ledger(
  p_period_id text DEFAULT NULL,
  p_account_id text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  company_id text,
  journal_entry_id text,
  journal_number text,
  entry_date date,
  account_id text,
  account_code text,
  account_name text,
  line_description text,
  debit numeric,
  credit numeric,
  running_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text;
  v_is_platform_admin boolean;
  v_period public.fiscal_periods%ROWTYPE;
  v_from date;
  v_to date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  v_is_platform_admin := public.is_platform_admin();
  v_company_id := public.my_company_id();
  IF NOT v_is_platform_admin AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'active company membership required';
  END IF;

  IF p_period_id IS NOT NULL THEN
    SELECT * INTO v_period FROM public.fiscal_periods
    WHERE id = p_period_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'period % not found', p_period_id;
    END IF;
    IF NOT v_is_platform_admin AND v_period.company_id <> v_company_id THEN
      RAISE EXCEPTION 'period % not found for company', p_period_id;
    END IF;
  END IF;

  v_from := COALESCE(p_from, CASE WHEN p_period_id IS NOT NULL THEN v_period."start" END);
  v_to := COALESCE(p_to, CASE WHEN p_period_id IS NOT NULL THEN v_period."end" END);

  IF p_account_id IS NOT NULL THEN
    PERFORM 1 FROM public.accounts AS a
    WHERE a.id = p_account_id
      AND (v_is_platform_admin OR a.company_id = v_company_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'account % not found for company', p_account_id;
    END IF;
  END IF;

  RETURN QUERY
  WITH ordered_lines AS (
    SELECT
      je.company_id,
      je.id AS journal_entry_id,
      je.number AS journal_number,
      je.date AS entry_date,
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      jel.description AS line_description,
      public.fx_to_company_base(je.company_id, jel.debit, je.currency, je.date) AS debit,
      public.fx_to_company_base(je.company_id, jel.credit, je.currency, je.date) AS credit,
      row_number() OVER (
        PARTITION BY a.id
        ORDER BY je.date, je.number, jel.id
      ) AS rn
    FROM public.journal_entry_lines AS jel
    INNER JOIN public.journal_entries AS je
      ON je.company_id = jel.company_id
      AND je.id = jel.journal_entry_id
      AND je.state = 'posted'
    INNER JOIN public.accounts AS a
      ON a.company_id = jel.company_id
      AND a.id = jel.account_id
    WHERE (v_is_platform_admin OR je.company_id = v_company_id)
      AND (p_account_id IS NULL OR a.id = p_account_id)
      AND (v_from IS NULL OR je.date >= v_from)
      AND (v_to IS NULL OR je.date <= v_to)
  )
  SELECT
    ol.company_id,
    ol.journal_entry_id,
    ol.journal_number,
    ol.entry_date,
    ol.account_id,
    ol.account_code,
    ol.account_name,
    ol.line_description,
    ol.debit,
    ol.credit,
    sum(ol.debit - ol.credit) OVER (
      PARTITION BY ol.account_id
      ORDER BY ol.entry_date, ol.journal_number, ol.rn
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::numeric AS running_balance
  FROM ordered_lines AS ol
  ORDER BY ol.entry_date, ol.journal_number, ol.rn;
END;
$$;

ALTER FUNCTION public.report_general_ledger(
  p_period_id text,
  p_account_id text,
  p_from date,
  p_to date
) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_general_ledger(
  p_period_id text,
  p_account_id text,
  p_from date,
  p_to date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_general_ledger(
  p_period_id text,
  p_account_id text,
  p_from date,
  p_to date
) TO authenticated;
