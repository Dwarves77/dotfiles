// PURE, dependency-free env predicate — no @supabase/supabase-js, no next/cache, no relative import
// of anything that pulls either in. CAP-1000-FIX (2026-09-05): extracted out of supabase-service.ts,
// whose own top-level `import { createClient } from "@supabase/supabase-js"` makes THAT module
// ERR_MODULE_NOT_FOUND the moment node_modules is absent — exactly the shape
// fsi-app/.discipline/run-test-suite.sh runs `node --test` in (no `npm ci`), which is how
// data-public-surface-slugs.test.mjs (PR #593) failed there while passing locally (node_modules
// present) and passing separately in build-proof CI (real node_modules, just no service-role key).
//
// One rule, one place: this is the ONLY definition of "is a service-role Supabase read even possible
// right now". supabase-service.ts imports and re-exports it (so `getServiceSupabase()` keeps checking
// exactly this predicate before its fail-closed throw) rather than keeping a second copy; every other
// caller — src/lib/data.ts's fetchAllPublicListingSlugs, this file's own test — imports it from HERE
// directly, never via a module that also drags in @supabase/supabase-js or next/cache.
export function isServiceSupabaseConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
