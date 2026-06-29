// ============================================================================
//  Edge Function: aemp-auth  —  AEMP JWT → Supabase session (SCAFFOLD)
//  --------------------------------------------------------------------------
//  Deploy:  supabase functions deploy aemp-auth --no-verify-jwt
//  Secrets needed (set via `supabase secrets set`):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (auto-injected in Edge runtime)
//    AEMP_JWKS_URL        — AEMP's JSON Web Key Set endpoint (to verify the JWT)
//    AEMP_ISSUER          — expected `iss` claim
//    AEMP_AUDIENCE        — expected `aud` claim
//
//  Flow (to be completed once AEMP supplies its JWKS + claim names — §16.1):
//    1. Read { aemp_token } from the request body.
//    2. Verify the JWT signature against AEMP_JWKS_URL and validate iss/aud/exp.
//    3. Map claims → { email, full_name, role (admin|field|manager), rig }.
//    4. Upsert the auth user (admin API) + public.profiles row (role, rig).
//    5. Mint a Supabase session for that user and return { access_token,
//       refresh_token } (e.g. via admin.generateLink / a signing helper).
//
//  NOTE: This file is intentionally NOT functional yet — it returns 501 so a
//  deployment can't silently "succeed". Replace the marked section with the
//  real verification + minting once the AEMP contract is known.
// ============================================================================
// @ts-nocheck — Deno/Edge runtime types are not part of the Vite tsconfig.

import { createClient } from 'jsr:@supabase/supabase-js@2';
// import { jwtVerify, createRemoteJWKSet } from 'npm:jose@5';  // for step 2

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { aemp_token } = await req.json().catch(() => ({}));
  if (!aemp_token) return new Response('Missing aemp_token', { status: 400 });

  // ---- TODO: implement once AEMP provides JWKS + claim mapping (PRD §16.1) ----
  //
  // const JWKS = createRemoteJWKSet(new URL(Deno.env.get('AEMP_JWKS_URL')!));
  // const { payload } = await jwtVerify(aemp_token, JWKS, {
  //   issuer: Deno.env.get('AEMP_ISSUER'),
  //   audience: Deno.env.get('AEMP_AUDIENCE'),
  // });
  // const email = payload.email as string;
  // const role  = mapAempRole(payload);   // -> 'admin' | 'field' | 'manager'
  // const rig   = payload.rig as string | undefined;
  //
  // const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // ... upsert user + profile(role, rig), then mint and return a session ...

  // Reference to keep the import meaningful in the scaffold:
  void createClient;

  return new Response(
    JSON.stringify({ error: 'aemp-auth not implemented — awaiting AEMP JWKS/claims (PRD §16.1)' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );
});
