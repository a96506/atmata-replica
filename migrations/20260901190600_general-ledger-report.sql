-- Dedicated general ledger report: posted JE lines with running balance.
-- Optional fiscal period and/or explicit date range; optional account filter.

CREATE INDEX IF NOT EXISTS journal_entries_company_id_date_idx
  ON public.journal_entries (company_id, date);

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
      jel.debit,
      jel.credit,
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
