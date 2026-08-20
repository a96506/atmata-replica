-- HTTP clients (InsForge PostgREST gateway) time out / retry on SQLSTATE 40001
-- (serialization_failure). Keep WRITE:STALE_VERSION in the message for
-- parseWriteRpcError, but raise via raise_write_error (P0001) so RPC probes
-- and Server Actions observe the denial instead of a 10s gateway timeout.

CREATE OR REPLACE FUNCTION public.assert_document_row_version(
  p_doc_type text,
  p_doc_id text,
  p_expected_row_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table text := public.document_table_name(p_doc_type);
  v_company_id text;
  v_row_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    PERFORM public.raise_write_error('UNAUTHENTICATED');
  END IF;

  IF p_expected_row_version IS NULL OR p_expected_row_version < 1 THEN
    PERFORM public.raise_write_error('VALIDATION', 'expected_row_version required');
  END IF;

  EXECUTE format(
    'SELECT company_id, row_version FROM public.%I '
    || 'WHERE id = $1 AND (company_id = public.my_company_id() '
    || 'OR public.is_platform_admin()) FOR UPDATE',
    v_table
  )
  INTO v_company_id, v_row_version
  USING p_doc_id;

  -- EXECUTE does not set FOUND; check assigned columns instead.
  IF v_company_id IS NULL THEN
    PERFORM public.raise_write_error('NOT_FOUND', 'document not found');
  END IF;

  IF v_row_version <> p_expected_row_version THEN
    PERFORM public.raise_write_error('STALE_VERSION', v_row_version::text);
  END IF;
END;
$$;
