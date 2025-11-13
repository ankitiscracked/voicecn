/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_USEVOICE_WS_URL?: string;
  readonly VITE_USEVOICE_USE_MOCK?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
