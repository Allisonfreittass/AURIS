/**
 * Compile-time constants baked in by `electron.vite.config.ts` from
 * `.env.production`. They drive the auth + proxy stack when the app is
 * launched as a packaged build (where there's no .env file alongside).
 *
 * In dev they're empty strings, so the existing `.env` flow takes over.
 */

declare const __AURIS_PROD_PROXY_URL__: string;
declare const __AURIS_PROD_SUPABASE_URL__: string;
declare const __AURIS_PROD_SUPABASE_ANON_KEY__: string;

export const PROD_PROXY_URL: string = __AURIS_PROD_PROXY_URL__;
export const PROD_SUPABASE_URL: string = __AURIS_PROD_SUPABASE_URL__;
export const PROD_SUPABASE_ANON_KEY: string = __AURIS_PROD_SUPABASE_ANON_KEY__;

export function hasProdConfig(): boolean {
  return Boolean(PROD_PROXY_URL && PROD_SUPABASE_URL && PROD_SUPABASE_ANON_KEY);
}
