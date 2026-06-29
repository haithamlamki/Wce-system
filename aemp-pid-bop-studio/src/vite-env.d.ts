/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AEMP_SSO_ENABLED?: string;
  readonly VITE_AEMP_AUTH_FN_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
