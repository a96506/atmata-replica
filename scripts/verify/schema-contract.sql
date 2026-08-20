/* schema-contract.sql
   Returns a single JSON object summarizing company_table_manifest tenancy checks.
   Run with: npx @insforge/cli db query --unrestricted "$(node -e "...")"
*/

SELECT jsonb_build_object(
  'checkedAt', now(),
  'manifestCount', (SELECT count(*)::int FROM public.company_table_manifest),
  'missingCompanyId', COALESCE((
    SELECT jsonb_agg(m.table_name ORDER BY m.table_name)
    FROM public.company_table_manifest AS m
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public'
        AND c.table_name = m.table_name
        AND c.column_name = 'company_id'
    )
  ), '[]'::jsonb),
  'rlsDisabled', COALESCE((
    SELECT jsonb_agg(m.table_name ORDER BY m.table_name)
    FROM public.company_table_manifest AS m
    JOIN pg_class AS cls ON cls.relname = m.table_name
    JOIN pg_namespace AS nsp ON nsp.oid = cls.relnamespace AND nsp.nspname = 'public'
    WHERE cls.relkind = 'r'
      AND NOT cls.relrowsecurity
  ), '[]'::jsonb),
  'missingPolicies', COALESCE((
    SELECT jsonb_agg(m.table_name ORDER BY m.table_name)
    FROM public.company_table_manifest AS m
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies AS p
      WHERE p.schemaname = 'public'
        AND p.tablename = m.table_name
    )
  ), '[]'::jsonb),
  'missingCompanyIdIndex', COALESCE((
    SELECT jsonb_agg(m.table_name ORDER BY m.table_name)
    FROM public.company_table_manifest AS m
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_indexes AS i
      WHERE i.schemaname = 'public'
        AND i.tablename = m.table_name
        AND i.indexdef ILIKE '%company_id%'
    )
  ), '[]'::jsonb),
  'ok', (
    NOT EXISTS (
      SELECT 1
      FROM public.company_table_manifest AS m
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND c.table_name = m.table_name
          AND c.column_name = 'company_id'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_table_manifest AS m
      JOIN pg_class AS cls ON cls.relname = m.table_name
      JOIN pg_namespace AS nsp ON nsp.oid = cls.relnamespace AND nsp.nspname = 'public'
      WHERE cls.relkind = 'r' AND NOT cls.relrowsecurity
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.company_table_manifest AS m
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_policies AS p
        WHERE p.schemaname = 'public' AND p.tablename = m.table_name
      )
    )
  )
) AS schema_contract;
