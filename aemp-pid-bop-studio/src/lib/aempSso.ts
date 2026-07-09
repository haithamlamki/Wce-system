// ============================================================================
//  AEMP SSO integration points (PRD §7.2 / FR-5, §16.1).
//  --------------------------------------------------------------------------
//  SCAFFOLD ONLY. The module is meant to run embedded inside AEMP, so the
//  chosen pattern is a TOKEN EXCHANGE:
//
//    AEMP (already authed)  --aemp_jwt-->  this module
//       --> POST aemp_jwt to the `aemp-auth` Edge Function
//       --> function verifies the JWT against AEMP's JWKS, upserts the user +
//           profile (role/rig from claims), returns a Supabase session
//       --> setSession() logs the user in; onAuthStateChange loads the profile
//
//  Nothing here mints a real session until AEMP supplies its JWKS/claims and
//  the Edge Function is deployed (see supabase/functions/aemp-auth/ and
//  docs/INTEGRATION.md §SSO). Calls throw clear, honest errors until then.
// ============================================================================
import { supabase } from './supabase';

const FN_URL = import.meta.env.VITE_AEMP_AUTH_FN_URL as string | undefined;

/** Allowlisted origins permitted to post an `aemp:token` message (comma-separated env var). */
const ALLOWED_ORIGINS = (import.meta.env.VITE_AEMP_ORIGIN as string | undefined)
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? [];

let warnedMissingAllowlist = false;

/**
 * Pure allowlist check for the `aemp:token` postMessage channel. Fails CLOSED:
 * an empty allowlist means no origin is trusted (production must set VITE_AEMP_ORIGIN).
 */
export function isAllowedAempOrigin(origin: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  return allowed.includes(origin);
}

/** True when the host app has enabled the AEMP SSO path. */
export const aempSsoEnabled =
  import.meta.env.VITE_AEMP_SSO_ENABLED === 'true' && Boolean(FN_URL);

/**
 * Read the AEMP token handed to the embedded module. Two supported channels:
 *   1. URL param `?aemp_token=…` (server-rendered embed), or
 *   2. a postMessage `{ type: 'aemp:token', token }` from the parent frame.
 * The parent-frame channel is wired by the host; here we only read the URL.
 */
export function readInboundAempToken(): string | null {
  const u = new URL(window.location.href);
  return u.searchParams.get('aemp_token');
}

/** Subscribe to an AEMP token delivered by the embedding parent via postMessage. */
export function onAempToken(handler: (token: string) => void): () => void {
  const listener = (e: MessageEvent) => {
    if (!isAllowedAempOrigin(e.origin, ALLOWED_ORIGINS)) {
      if (ALLOWED_ORIGINS.length === 0 && !warnedMissingAllowlist) {
        warnedMissingAllowlist = true;
        console.warn(
          'aempSso: VITE_AEMP_ORIGIN is unset — the aemp:token postMessage channel is disabled ' +
            '(failing closed) until an origin allowlist is configured.'
        );
      }
      return;
    }
    if (e.data && e.data.type === 'aemp:token' && typeof e.data.token === 'string') {
      handler(e.data.token);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Exchange an AEMP JWT for a Supabase session via the `aemp-auth` Edge Function.
 * @throws with a clear message until SSO is configured/deployed.
 */
export async function signInWithAemp(aempToken?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!FN_URL) throw new Error('AEMP SSO is not configured (set VITE_AEMP_SSO_ENABLED + VITE_AEMP_AUTH_FN_URL).');
  const token = aempToken ?? readInboundAempToken();
  if (!token) throw new Error('No AEMP token was provided by the host application.');

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aemp_token: token }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AEMP token exchange failed (${res.status}). ${detail}`);
  }
  const { access_token, refresh_token } = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!access_token || !refresh_token) throw new Error('AEMP auth function did not return a Supabase session.');

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(error.message);
}
