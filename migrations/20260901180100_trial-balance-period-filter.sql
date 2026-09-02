-- Wave 3: optional fiscal-period filter for report_trial_balance().
-- When p_period_id is set, JE lines are limited to that period's date range
-- (same pattern as report_pnl). When NULL, all posted entries (backward compatible).

DROP FUNCTION IF EXISTS public.report_trial_balance();

CREATE OR REPLACE FUNCTION public.report_trial_balance(p_period_id text DEFAULT NULL)
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
      AND (
        p_period_id IS NULL
        OR (je.date >= v_period."start" AND je.date <= v_period."end")
      )
  )
    ON jel.company_id = a.company_id
    AND jel.account_id = a.id
  WHERE v_is_platform_admin OR a.company_id = v_company_id
  GROUP BY a.company_id, a.id, a.code, a.name, a.type
  ORDER BY a.company_id, a.code;
END;
$$;

ALTER FUNCTION public.report_trial_balance(p_period_id text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.report_trial_balance(p_period_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_trial_balance(p_period_id text) TO authenticated;
