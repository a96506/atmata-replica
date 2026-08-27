-- Follow-up to 20260827171435_fix-financial-sign-and-cash.sql.
--
-- The previous migration set totals.equity to v_total_equity (equity folded
-- with the net-income plug). That double-counts retained_earnings against the
-- verification identity:
--   totals.assets = totals.liabilities + totals.equity + totals.retained_earnings
--
-- Fix: keep the "Total equity" LINE ITEM folded (v_total_equity) so the equity
-- section presents the composed total, but expose totals.equity as the RAW
-- equity account balance (v_equity) so the totals keys decompose cleanly into
-- liabilities + equity + retained_earnings. total_liabilities_equity stays
-- v_liabilities + v_total_equity, so Assets = Liabilities + Equity holds by
-- construction (double-entry identity). Signature unchanged; grants from M12
-- remain valid.

CREATE OR REPLACE FUNCTION public.report_balance_sheet(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
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

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_assets
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'asset'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_liabilities
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'liability'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_equity
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'equity'
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  -- Current-period net income as the equity plug (inception entity; year-end
  -- close is not yet wired in v1).
  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
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
