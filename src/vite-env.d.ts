/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Set to "true" at build time to route inventory through bridallive-inventory-provider (Phase 2). */
  readonly VITE_BRIDALLIVE_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
