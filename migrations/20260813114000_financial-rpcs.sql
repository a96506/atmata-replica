-- M12: Postgres-native financial statement RPCs.
-- report_pnl, report_balance_sheet, report_cash_flow.
-- SECURITY DEFINER, search_path pinned via CREATE FUNCTION SET, scoped by my_company_id().
-- Replaces DEMO_FINANCIALS TS-side compute for the accounting/financials page
-- AND feeds the financial-statement PDF. M8 only had trial_balance + AR/AP
-- aging + item_snapshot + item_stock_by_warehouse.
--
-- Output contract (all three): jsonb {line_items, totals}
--   line_items: [{label text, amount numeric}]  -- amount signed, raw (no formatting)
--   totals:     {key text: numeric}              -- flat, signed
-- Formatting (currency, 3-decimal KWD, locale) stays TS-side so en/ar render correctly.
--
-- report_sign: +1 for debit-normal (asset, expense), -1 for credit-normal
-- (liability, equity, revenue). Flips debit/credit in SQL so the app always
-- sees "positive = normal balance increase" without sign juggling.
--
-- is_cash: marks cash accounts for direct-method CF. Backfilled from
-- bank_accounts.account_id membership; a company can flip additional accounts
-- (petty cash, cash on hand) manually without inventing a fake bank_accounts row.

ALTER TABLE public.accounts
  ADD COLUMN report_sign smallint NOT NULL DEFAULT 1;

UPDATE public.accounts SET report_sign = 1
  WHERE type IN ('asset', 'expense');
UPDATE public.accounts SET report_sign = -1
  WHERE type IN ('liability', 'equity', 'revenue');

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_report_sign_check CHECK (report_sign IN (-1, 1));

ALTER TABLE public.accounts
  ADD COLUMN is_cash boolean NOT NULL DEFAULT false;

UPDATE public.accounts a SET is_cash = true
WHERE EXISTS (
  SELECT 1 FROM public.bank_accounts b
  WHERE b.account_id = a.id AND b.company_id = a.company_id
);

CREATE INDEX accounts_company_type_idx
  ON public.accounts(company_id, type);

-- ---------------------------------------------------------------------------
-- report_pnl(p_period_id)
-- Income statement for the given fiscal period. Single-pass, pre-summed.
-- Revenue accounts contribute positive; expense accounts contribute negative
-- (so cost of sales and opex are already negative on the amount axis).
-- Net income = SUM of all line amounts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_pnl(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
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

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_revenue
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'revenue'
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_cogs
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type = 'expense'
    AND a.code LIKE '5%'
    AND e.date >= v_period."start" AND e.date <= v_period."end"
    AND e.state = 'posted';

  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
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

-- ---------------------------------------------------------------------------
-- report_balance_sheet(p_period_id)
-- Closing balances inception -> period end. Assets positive = debit balance;
-- liabilities/equity positive = credit balance (report_sign flip).
-- ---------------------------------------------------------------------------
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

  -- Retained earnings = current-period net income (inception entity, closed
  -- to equity at year end; for v1 we surface the period's net income as the
  -- equity plug so the BS balances while year-end close is not yet wired).
  SELECT COALESCE(SUM((l.debit - l.credit) * a.report_sign), 0)
    INTO v_net_income
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.type IN ('revenue', 'expense')
    AND e.date <= v_period."end"
    AND e.state = 'posted';

  v_total_le := v_liabilities + v_equity + v_net_income;

  RETURN jsonb_build_object(
    'line_items', jsonb_build_array(
      jsonb_build_object('label', 'Total assets', 'amount', v_assets),
      jsonb_build_object('label', 'Total liabilities', 'amount', v_liabilities),
      jsonb_build_object('label', 'Total equity', 'amount', v_equity),
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

-- ---------------------------------------------------------------------------
-- report_cash_flow(p_period_id)
-- Direct method: net change in cash accounts during the period.
-- v1: single-line (no operating/investing/financing breakdown — no category
-- tagging on accounts yet). Beginning + ending cash for context.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_cash_flow(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_company_id text := public.my_company_id();
  v_period public.fiscal_periods%ROWTYPE;
  v_beginning numeric;
  v_change numeric;
  v_ending numeric;
BEGIN
  SELECT * INTO v_period FROM public.fiscal_periods
  WHERE id = p_period_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'period % not found for company', p_period_id;
  END IF;

  SELECT COALESCE(SUM(l.debit - l.credit), 0)
    INTO v_beginning
  FROM public.journal_entry_lines l
  JOIN public.accounts a ON a.id = l.account_id AND a.company_id = l.company_id
  JOIN public.journal_entries e ON e.id = l.journal_entry_id AND e.company_id = l.company_id
  WHERE l.company_id = v_company_id
    AND a.is_cash
    AND e.date < v_period."start"
    AND e.state = 'posted';

  SELECT COALESCE(SUM(l.debit - l.credit), 0)
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

REVOKE ALL ON FUNCTION public.report_pnl(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_balance_sheet(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_cash_flow(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_pnl(text) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.report_balance_sheet(text) TO authenticated, project_admin;
GRANT EXECUTE ON FUNCTION public.report_cash_flow(text) TO authenticated, project_admin;
