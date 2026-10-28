/**
 * Type surface of `gen_info.js` as consumed by the TypeScript toolbar.
 * Only the members the toolbar touches are declared here.
 */
declare const GenInfo: {
  /** Fetches the post's generation metadata and renders it into `#gen-info-container`. Resolves to whether any was found. */
  loadAndShow (): Promise<boolean>;
};

export default GenInfo;
