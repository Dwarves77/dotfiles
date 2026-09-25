// data-audit: label=id-redirect-targets hard=true
/** VERIFIER (read-only, 0 Browserless): every uuid detail URL ends on a page that renders.
 *
 *  The class it guards (lane REG-REDIRECT, 2026-09-24): /regulations/<uuid> used to 307 to
 *  /regulations/<legacy_id> whenever a legacy_id existed, and the slug page 404'd whenever the item was not
 *  verified or belonged to another surface (the live case: d2da85da, a quarantined regulation). The four
 *  `[slug]` routes now share one resolver (src/lib/detail/id-redirect.ts, applyIdRedirect in load-detail.ts).
 *  This check runs that resolver over the WHOLE live corpus, for each row on each of the four surfaces, and
 *  re-derives where each decision lands from the detail route's own read (findIdRedirectViolations): a
 *  redirect must land on a page that renders the same item; a render at the uuid URL must render; a
 *  not-found is only allowed for an item no surface admits.
 *
 *  Exit 0 = invariant holds. Exit 1 = at least one uuid URL redirects into, or renders, a page that 404s an
 *  admissible item. Exit 2 = no DB credentials or a read error (cannot verify; never a false green).
 *  Reads only. Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run by run-data-audit-lane.mjs. */
import { readAll } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import {
  ID_REDIRECT_COLUMNS,
  admittedSurfaceFor,
  findIdRedirectViolations,
} from "../../src/lib/detail/id-redirect.ts";

loadLocalEnvFile();

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("id-redirect-target-audit: SKIP, no NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. Cannot verify, exit 2.");
  process.exit(2);
}

let rows;
try {
  rows = await readAll("intelligence_items", ID_REDIRECT_COLUMNS.replace(/\s+/g, ""));
} catch (e) {
  console.error(`id-redirect-target-audit: read failed: ${e.message}`);
  process.exit(2);
}

const withSlug = rows.filter((r) => r.legacy_id);
const slugNotAdmissible = withSlug.filter((r) => admittedSurfaceFor(r) === null);
const violations = findIdRedirectViolations(rows);

console.log("\n===== ID-REDIRECT TARGETS (read-only) =====");
console.log(`intelligence_items: ${rows.length}  |  with legacy_id: ${withSlug.length}  |  uuid URLs checked: ${rows.length * 4}`);
console.log(`  legacy_id on an item no surface admits (not-found at the uuid URL, never redirected): ${slugNotAdmissible.length}`);
console.log(`  VIOLATIONS (a uuid URL that lands on a 404 for an admissible item, or redirects into one): ${violations.length}`);

if (violations.length) {
  for (const v of violations.slice(0, 40)) {
    console.log(`  ${v.decision.padEnd(9)} ${v.from}  ->  ${v.to ?? "(same URL)"}  : ${v.reason}`);
  }
  if (violations.length > 40) console.log(`  ... +${violations.length - 40} more`);
  console.log("\nLANE-FAIL: a detail uuid URL does not end where the item can be read.");
  console.log("FIX: keep src/lib/detail/id-redirect.ts's admittedSurfaceFor equal to loadDetail's admission");
  console.log("(fetchIntelligenceItemUncached's verified gate + loadDetailCore's canonicalSurface check).");
  process.exit(1);
}
console.log("invariant holds: every uuid detail URL renders its item, redirects to a page that does, or 404s an item no surface admits.");
process.exit(0);
