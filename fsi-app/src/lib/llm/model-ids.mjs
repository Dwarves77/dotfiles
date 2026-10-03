// model-ids.mjs - single shared home for sanctioned Claude model ids (lane L8, 2026-10-02 extraction).
// Pulled out of src/lib/llm/haiku-classify.ts (which re-exports it unchanged, so every existing
// importer of HAIKU_MODEL from that module keeps working byte-for-byte) so a plain-ESM SCRIPT
// (scripts/research/backfill-themes.mjs) can import the SAME model id without pulling in
// haiku-classify.ts's own Anthropic SDK package and html-to-text.mjs imports - those are fine inside a
// Next.js route's bundle, not inside a script that needs to stay out of the no-npm discipline test
// glob (fsi-app/.discipline/glob-portability.test.mjs).
//
// Zero dependencies, by design: nothing may ever be added here that is not a bare string constant.
// PLAIN ESM, same portability discipline as src/lib/research/taxonomy.mjs.
//
// UPDATE (coordinator directive, 2026-10-02, same-day follow-up): src/lib/llm/first-fetch-classify.ts
// ALSO carried its own independent hand-typed copy of this literal (a second drifted copy, found by
// grep, not assumed) and now imports it from here too - see that file's own import-site comment.
//
// REMAINING KNOWN DRIFT (flagged, not fixed here - outside this lane's write set; named in this
// lane's session-log addendum for the coordinator's named follow-up dispatch): src/lib/sources/
// verification.ts (its own `const HAIKU_MODEL = "claude-haiku-4-5-20251001";`) and every inline
// `model: "claude-haiku-4-5-20251001"` / `model: "claude-sonnet-4-6"` literal at a `.messages.create`
// or `spendMessage`/`spendStream` call site outside this module's two importers above.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
