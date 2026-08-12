-- Operational models kept outside individual document families: bank
-- reconciliation, month-end close, lot/FEFO inventory, and depreciation.

CREATE TABLE public.inventory_lots (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  warehouse_id text NOT NULL,
  lot_number text NOT NULL,
  received_on date NOT NULL DEFAULT current_date,
  expires_on date,
  on_hand numeric(18,6) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, product_id, warehouse_id, lot_number),
  FOREIGN KEY (company_id, product_id)
    REFERENCES public.products(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES public.warehouses(company_id, id) ON DELETE RESTRICT,
  CHECK (expires_on IS NULL OR expires_on >= received_on)
);

CREATE TABLE public.fixed_assets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  acquisition_date date NOT NULL,
  cost numeric(18,3) NOT NULL CHECK (cost >= 0),
  residual_value numeric(18,3) NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  useful_life_months integer NOT NULL CHECK (useful_life_months > 0),
  depreciation_expense_account_id text NOT NULL,
  accumulated_depreciation_account_id text NOT NULL,
  accumulated_depreciation numeric(18,3) NOT NULL DEFAULT 0 CHECK (accumulated_depreciation >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, code),
  FOREIGN KEY (company_id, depreciation_expense_account_id)
    REFERENCES public.accounts(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, accumulated_depreciation_account_id)
    REFERENCES public.accounts(company_id, id) ON DELETE RESTRICT,
  CHECK (residual_value <= cost),
  CHECK (accumulated_depreciation <= cost - residual_value)
);

CREATE TABLE public.bank_statements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id text NOT NULL,
  number text NOT NULL,
  period_start date,
  period_end date,
  opening_balance numeric(18,3),
  closing_balance numeric(18,3),
  source_url text,
  source_key text,
  status text NOT NULL DEFAULT 'imported'
    CHECK (status IN ('imported', 'reconciling', 'reconciled', 'failed')),
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, number),
  FOREIGN KEY (company_id, bank_account_id)
    REFERENCES public.bank_accounts(company_id, id) ON DELETE RESTRICT,
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE TABLE public.bank_statement_lines (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_statement_id text NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  date date NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text,
  amount numeric(18,3) NOT NULL CHECK (amount <> 0),
  running_balance numeric(18,3),
  status text NOT NULL DEFAULT 'unmatched'
    CHECK (status IN ('unmatched', 'suggested', 'matched', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, bank_statement_id, line_number),
  FOREIGN KEY (company_id, bank_statement_id)
    REFERENCES public.bank_statements(company_id, id) ON DELETE CASCADE
);

CREATE INDEX bank_statement_lines_unmatched_idx
  ON public.bank_statement_lines(company_id, bank_statement_id, status);

CREATE TABLE public.reconciliation_sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_statement_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, bank_statement_id),
  FOREIGN KEY (company_id, bank_statement_id)
    REFERENCES public.bank_statements(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.reconciliation_rules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  match_type text NOT NULL CHECK (match_type IN ('reference', 'amount', 'description', 'compound')),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, name)
);

CREATE TABLE public.reconciliation_matches (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reconciliation_session_id text NOT NULL,
  bank_statement_line_id text NOT NULL,
  journal_entry_id text,
  source_doc_type text,
  source_doc_id text,
  rule_id text,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'rejected', 'manual')),
  proposed_by text NOT NULL DEFAULT 'rule' CHECK (proposed_by IN ('rule', 'ai', 'user')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, reconciliation_session_id)
    REFERENCES public.reconciliation_sessions(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, bank_statement_line_id)
    REFERENCES public.bank_statement_lines(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, journal_entry_id)
    REFERENCES public.journal_entries(company_id, id) ON DELETE SET NULL,
  FOREIGN KEY (company_id, rule_id)
    REFERENCES public.reconciliation_rules(company_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX reconciliation_matches_line_je_unique_idx
  ON public.reconciliation_matches(company_id, bank_statement_line_id, journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE TABLE public.period_close_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_period_id text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, fiscal_period_id),
  FOREIGN KEY (company_id, fiscal_period_id)
    REFERENCES public.fiscal_periods(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.period_close_tasks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_close_run_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sequence smallint NOT NULL CHECK (sequence > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'blocked', 'completed', 'skipped')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, period_close_run_id, code),
  FOREIGN KEY (company_id, period_close_run_id)
    REFERENCES public.period_close_runs(company_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'inventory_lots', 'fixed_assets', 'bank_statements', 'bank_statement_lines',
    'reconciliation_sessions', 'reconciliation_rules', 'reconciliation_matches',
    'period_close_runs', 'period_close_tasks'
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
