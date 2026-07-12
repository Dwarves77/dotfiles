// THE canonical service-role Supabase client (one home; C1 consolidation target). FAIL-CLOSED by construction
// (SF-1, 2026-05-27): a missing SUPABASE_SERVICE_ROLE_KEY THROWS — it NEVER silently downgrades to the anon key.
// The prior downgrade masked service-role misconfiguration in production as RLS-blocked reads (empty payloads
// downstream), and the same anon-fallback pattern re-appeared ad-hoc in coverage-gaps.ts (Ruling 2 C1, the live
// defect). Every service-role client construction routes through here; F19 forbids the `SERVICE_ROLE || ANON`
// downgrade anywhere in src.
import { createClient } from "@supabase/supabase-js";

export function getServiceSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Service-role reads are unavailable (fail-closed — " +
        "never downgrade to the anon key). Set the env var in Vercel project settings."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
