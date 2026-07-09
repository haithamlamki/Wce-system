-- ============================================================================
--  0023_tubular_harden_internal_functions.sql — advisor follow-up (same class
--  as 0013): Supabase's ALTER DEFAULT PRIVILEGES auto-grants EXECUTE to anon
--  and authenticated on every new function, which exposed the Tubular
--  module's INTERNAL helpers via /rest/v1/rpc/*:
--    - _tubular_movement_submission(): SECURITY DEFINER audit writer with no
--      internal permission guard (it trusts its RPC callers) — a signed-in
--      user could have called it directly and forged movement submissions.
--    - _tubular_perm_holders(): leaks which users hold a permission.
--    - notify_movement() / notify_pipe_order_event(): trigger bodies; never
--      meant to be API-callable (harmless as triggers, but no reason to
--      expose them).
--  Trigger firing and SECDEF-internal PERFORM calls do NOT require the caller
--  to hold EXECUTE, so revoking is safe. Flagged by Supabase advisor lints
--  0028/0029 immediately after 0018/0021 were applied.
-- ============================================================================

revoke all on function public._tubular_movement_submission(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public._tubular_perm_holders(text) from public, anon, authenticated;
revoke all on function public.notify_movement() from public, anon, authenticated;
revoke all on function public.notify_pipe_order_event() from public, anon, authenticated;

-- pre-existing WCE trigger functions with the same exposure (defense in depth;
-- their bodies are harmless, but they are not API surface)
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
