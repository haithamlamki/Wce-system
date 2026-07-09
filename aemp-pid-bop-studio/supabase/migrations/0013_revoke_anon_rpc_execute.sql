-- ============================================================================
--  0013_revoke_anon_rpc_execute.sql — realize 0012's stated intent (F12 follow-up).
--  --------------------------------------------------------------------------
--  0012 did `revoke all ... from public` before granting EXECUTE to
--  `authenticated`, intending that anonymous/unauthenticated callers cannot
--  invoke the transactional RPCs at all. On Supabase that is NOT sufficient:
--  the project ships `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ... TO anon`
--  (and service_role), so every newly-created function is auto-granted to
--  `anon` regardless of the PUBLIC revoke. Supabase advisor lint 0028
--  (anon_security_definer_function_executable) flags exactly this.
--
--  This was never exploitable: both function bodies re-check authorization and
--  fail CLOSED — an anon caller has my_role() = NULL, which the NULL-safe
--  `is distinct from 'admin'` / `not is_privileged()` guards reject. This
--  migration blocks anon at the GRANT layer too (defense in depth) so the
--  code and its documented intent match, and clears the advisor warning.
--
--  Idempotent / forward-only: safe to re-run, no data change, no downtime.
-- ============================================================================

revoke execute on function public.replace_rig_equipment(text, jsonb) from anon;
revoke execute on function public.rename_unit(text, text) from anon;
