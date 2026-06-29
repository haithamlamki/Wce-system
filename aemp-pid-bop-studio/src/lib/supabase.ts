// ============================================================================
//  Supabase client (Phase-1 backend).
//  Reads credentials from Vite env (.env.local). Until AEMP SSO lands, the app
//  uses the publishable (anon) key and the demo RLS policies in the initial
//  migration. `isSupabaseConfigured` lets the UI degrade gracefully to local
//  storage / the embedded cache when env vars are absent.
// ============================================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: false } })
  : null;
