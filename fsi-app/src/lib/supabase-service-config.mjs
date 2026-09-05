// supabase-service-config.mjs — the pure predicate half of supabase-service.ts's fail-closed
// contract (CAP-1000 FIX, 2026-09-05), split into its own npm-free leaf module (ASSEMBLE-47 gate fix,
// 2026-09-05).
//
// WHY THIS EXISTS AS A SEPARATE FILE, NOT INLINE IN supabase-service.ts: supabase-service.ts's own
// top-level `import { createClient } from "@supabase/supabase-js"` makes the WHOLE module
// unresolvable without `node_modules` present (`ERR_MODULE_NOT_FOUND`) — fine for app code (Next
// always runs with node_modules), but data-public-surface-slugs.test.mjs is one of the NAMED files
// fsi-app/.discipline/run-test-suite.sh runs in the no-`npm ci` discipline-engine CI job (see that
// script's header: "every listed test MUST import only node: builtins + relative .mjs"), and it needs
// the REAL isServiceSupabaseConfigured() predicate (not a reimplementation — that would be exactly the
// "re-implementing a second time" this predicate's own header says to avoid) to prove tests (a)/(b)/(c)
// of the CAP-1000-FIX gate. Moving the one-line predicate here — no logic duplicated, only relocated —
// lets that test import it directly with zero npm dependency, while supabase-service.ts (and every
// other caller, via supabase-server.ts's existing re-export) keeps working unchanged by importing and
// re-exporting THIS module. One home for the logic; two import paths for two different constraints.
export function isServiceSupabaseConfigured() {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
