// stub-empty-css.mjs — audit-harness alias target for CSS imports esbuild's plain bundler cannot
// load (no CSS/asset loader configured, unlike the real Next webpack build). A no-op module: the
// harness's own STYLE_INJECT already carries the full compiled app.css, so the visual result is
// unaffected — only Leaflet's own image-referencing CSS is skipped.
export {};
