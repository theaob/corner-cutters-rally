/** The build's version: the package's and the commit's (vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** the backend (supabase/README.md): its URL and public key; left out, the game plays offline */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** where the game is played, on shared result cards */
  readonly VITE_SHARE_URL?: string;
  readonly VITE_STORE?: string;
}
