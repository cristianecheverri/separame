/// <reference types="vite/client" />

/** true only in `VITE_MOCK=1 vite` (dev server); a literal `false` in every build. */
declare const __MOCK__: boolean;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  readonly VITE_AWS_REGION?: string;
  readonly VITE_STAGE?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_MOCK?: string;
}
