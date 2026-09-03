// stub-community-css.mjs — smoke-harness alias target for
// `@/components/community/community.css` (see Post.tsx / EntityDiscoveryPanel.tsx's own import
// comment). esbuild's plain `write:false` bundle build (harness.mjs's `bundleEntry`, coordinator-
// owned, not in this lane's write set) has no `outdir` configured, so bundling a real `.css` import
// is a build error ("Cannot import ... without an output path configured") — this empty module
// stands in for it in the smoke harness only. The real Next.js app never sees this file; it bundles
// `community.css` natively via its own CSS pipeline, the same as every other `.css` import in this
// app (see src/app/layout.tsx, src/components/map/MapView.tsx).
export {};
