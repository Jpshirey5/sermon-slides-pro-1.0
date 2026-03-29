/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_SCRIPTURE_API_BASE_URL?: string;
  readonly VITE_STRIPE_PRICE_PRO_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_PRO_ANNUAL?: string;
  readonly VITE_STRIPE_PRICE_TEAM_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_TEAM_ANNUAL?: string;
  readonly VITE_STRIPE_PRICE_ENTERPRISE_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_ENTERPRISE_ANNUAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
