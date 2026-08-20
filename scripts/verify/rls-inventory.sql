/* rls-inventory.sql
   List RLS policies for public tables as JSON.
*/

SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'schemaname', p.schemaname,
      'tablename', p.tablename,
      'policyname', p.policyname,
      'permissive', p.permissive,
      'roles', to_jsonb(p.roles),
      'cmd', p.cmd,
      'qual', p.qual,
      'with_check', p.with_check
    )
    ORDER BY p.tablename, p.policyname
  ),
  '[]'::jsonb
) AS rls_inventory
FROM pg_policies AS p
WHERE p.schemaname = 'public';
