interface ImportMetaEnv {
  /** The igv-bot server the Viewer joins its Room on. */
  readonly VITE_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
