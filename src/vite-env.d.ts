/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_PRICE_CORE_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_CORE_ANNUAL?: string;
  readonly VITE_STRIPE_PRICE_TEAM_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_TEAM_ANNUAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
