-- Fix QA findings F-009, F-016, F-017, F-046.
--
-- Root cause: M12 (20260813114000_financial-rpcs.sql) set accounts.report_sign
-- and accounts.is_cash via a ONE-TIME UPDATE on rows that existed when M12 ran.
-- provision_company (in 20260809064439_core-master-data.sql) inserts accounts
-- WITHOUT report_sign/is_cash, so every tenant provisioned AFTER M12 got the
-- column DEFAULTs: report_sign = 1 for equity/liability/revenue (wrong) and
-- is_cash = false for the Cash account (wrong).
--
-- This migration:
--   a. Reclassifies Accumulated depreciation (2300) from liability to asset
--      (it is a contra-asset; its credit balance then displays as a negative
--      asset, reducing total assets — correct contra behavior).
--   b. Backfills report_sign from type for ALL accounts.
--   c. Backfills is_cash = true for Cash (1000) and Bank (1010).
--   d. Adds a BEFORE INSERT OR UPDATE OF type trigger on accounts that keeps
--      report_sign in sync with type and seeds is_cash for cash/bank accounts.
--   e. Adds an AFTER INSERT OR UPDATE OF account_id trigger on bank_accounts
--      that flips is_cash = true on the linked GL account.
--   f. Recreates report_balance_sheet so equity is presented as a positive
--      credit-normal balance and the current-period net-income plug is folded
--      into total equity, so Assets = Liabilities + Equity holds by
--      construction.
--
-- report_pnl and report_cash_flow are NOT touched — they are correct once the
-- data is fixed. No GRANT statements are added; the existing grants from M12
-- remain valid because the function signature is unchanged.

-- ---------------------------------------------------------------------------
-- a. Reclassify Accumulated depreciation (2300) to contra-asset.
--    Done BEFORE the report_sign backfill so the backfill picks up the new type.
-- ---------------------------------------------------------------------------
UPDATE public.accounts
  SET type = 'asset'
  WHERE code = '2300'
    AND name ILIKE '%accumulated depreciation%';

-- ---------------------------------------------------------------------------
-- b. Backfill report_sign from type for ALL accounts.
--    -1 for credit-normal (liability, equity, revenue), +1 otherwise.
-- ---------------------------------------------------------------------------
UPDATE public.accounts
  SET report_sign = CASE
    WHEN type IN ('liability', 'equity', 'revenue') THEN -1
    ELSE 1
  END;

-- ---------------------------------------------------------------------------
-- c. Backfill is_cash = true for Cash (1000) and Bank (1010).
--    These are the direct-method CF cash accounts. Companies can still flip
--    additional accounts (petty cash, cash on hand) manually.
-- ---------------------------------------------------------------------------
UPDATE public.accounts
  SET is_cash = true
  WHERE code IN ('1000', '1010')
    AND type = 'asset';

-- ---------------------------------------------------------------------------
-- d. BEFORE INSERT OR UPDATE OF type trigger on accounts.
--    Keeps report_sign in sync with type and seeds is_cash for cash/bank
--    accounts when the caller did not explicitly set is_cash.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounts_sync_report_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.report_sign := CASE
    WHEN NEW.type IN ('liability', 'equity', 'revenue') THEN -1
    ELSE 1
  END;

  IF NEW.is_cash = false
     AND NEW.type = 'asset'
     AND NEW.code IN ('1000', '1010') THEN
    NEW.is_cash := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_sync_report_sign_trigger ON public.accounts;
CREATE TRIGGER accounts_sync_report_sign_trigger
  BEFORE INSERT OR UPDATE OF type ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.accounts_sync_report_sign();

-- ---------------------------------------------------------------------------
-- e. AFTER INSERT OR UPDATE OF account_id trigger on bank_accounts.
--    Flips is_cash = true on the linked GL account so the direct-method CF
--    picks up bank accounts without a manual backfill.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bank_accounts_sync_is_cash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    UPDATE public.accounts
      SET is_cash = true
      WHERE id = NEW.account_id
        AND company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bank_accounts_sync_is_cash_trigger ON public.bank_accounts;
CREATE TRIGGER bank_accounts_sync_is_cash_trigger
  AFTER INSERT OR UPDATE OF account_id ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.bank_accounts_sync_is_cash();

-- ---------------------------------------------------------------------------
-- f. Recreate report_balance_sheet(p_period_id).
--    Equity section presents credit-normal balances as positive (report_sign
--    now correct) and folds the current-period net-income plug into total
--    equity so Assets = Liabilities + Equity holds by construction.
--    Output contract and grants from M12 are preserved (signature unchanged).
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
      'equity', v_total_equity,
      'retained_earnings', v_net_income,
      'total_liabilities_equity', v_total_le
    )
  );
END;
$$;
