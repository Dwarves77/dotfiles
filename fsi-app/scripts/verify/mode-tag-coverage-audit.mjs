/** VERIFIER (read-only, editorial-tracking, SOFT): MAP MODE-TAG COVERAGE (P6, 2026-09-06).
 *
 *  BUG (operator, 2026-09-06): "Map mode tag coverage 2.1% (21 of 976 items tagged), needs
 *  editorial tracking." This is NOT a UI fix — the Map surface (MapPageView.tsx `modeTagStats`)
 *  already computes and shows the honest coverage figure it has, live, per render. What did not
 *  exist was a standing, CI-gated measurement an editor/operator can act on over time, with the
 *  actual untagged item ids to go tag — this script is that measurement.
 *
 *  SCOPE: `intelligence_items.transport_modes` (TEXT[]) on Regulations-domain rows (domain=1, the
 *  ONLY domain the Map surface charts — MapPageView.tsx's own `modeTagStats` gates the same way).
 *  "Coverage" = the fraction of non-archived Regulations rows carrying at least one transport-mode
 *  tag. This mirrors the client-side stat exactly (same domain filter, same "any tag present"
 *  definition) so this audit's number and the UI's live caption can never silently diverge.
 *
 *  NO CLASSIFIER TO CALL: read `scripts/classification/propose-classifications.mjs` and
 *  `scripts/classification/apply-classifications.mjs` (Axis 3/4/5 SOURCE classification —
 *  scope_modes/scope_verticals/expected_output on `sources`, never `transport_modes` on
 *  `intelligence_items`) and `scripts/maintenance/apply-classifications.mjs` (same source-axis
 *  scope, re-exported) before assuming one exists: NONE of these three propose or apply an
 *  ITEM-level `transport_modes` value from item text. There is no deterministic transport-mode
 *  classifier anywhere in this repo — [CONFIRMED] by reading every `transport_modes`-touching
 *  script under scripts/ (grep, 2026-09-06: only derive-obligations.mjs reads the column, to
 *  route an obligation by mode already set; nothing writes it from text). Per the dispatch's own
 *  instruction, this is reported as a genuine gap rather than answered with a fabricated
 *  classifier: THE MISSING PIECE IS A TRANSPORT-MODE CLASSIFIER (propose-only, ratified like
 *  every other axis proposal — see propose-classifications.mjs's header for the exact pattern to
 *  extend) that does not exist yet. This audit makes the gap's SIZE visible and actionable
 *  (per-surface coverage + untagged ids); it does not itself close it (no LLM, no guessing).
 *
 *  SOFT (informational, never blocks the lane): an editorial backlog, not a data-integrity
 *  violation — matches wave-acceptance-audit.mjs's own soft posture for the same reason (needs
 *  human editorial work, not a mechanical fix). Exit 0 always (soft finding still reported); exit 2
 *  = cannot verify (no creds). Reads only. Requires env: NEXT_PUBLIC_SUPABASE_URL +
 *  SUPABASE_SERVICE_ROLE_KEY. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

// Regulations domain only — the ONLY domain the Map surface charts (MapPageView.tsx's own
// `modeTagStats` and `filteredResources` both gate on `r.domain !== REGULATIONS_DOMAIN`).
const REGULATIONS_DOMAIN = 1;

let rows;
try {
  rows = await readAll("intelligence_items", "id,legacy_id,title,domain,transport_modes,is_archived", {
    match: (q) => q.eq("domain", REGULATIONS_DOMAIN).eq("is_archived", false),
  });
} catch (e) {
  console.error(`mode-tag-coverage-audit: read failed (no creds or DB unreachable): ${e.message}`);
  process.exit(2);
}

const total = (rows || []).length;
const untagged = (rows || []).filter((r) => !(r.transport_modes || []).length);
const tagged = total - untagged.length;
const pct = total > 0 ? ((tagged / total) * 100).toFixed(1) : "0.0";

console.log(`\n===== MAP MODE-TAG COVERAGE (editorial tracking, read-only, SOFT) =====`);
console.log(`Map surface (Regulations domain, non-archived): ${tagged} of ${total} items carry a transport_modes tag (${pct}%).`);

if (untagged.length > 0) {
  console.log(`\n── UNTAGGED ITEMS (need an editor to set transport_modes) ──`);
  const SHOWN = 50;
  for (const it of untagged.slice(0, SHOWN)) {
    console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ${(it.title || "").slice(0, 70)}`);
  }
  if (untagged.length > SHOWN) {
    console.log(`  ...and ${untagged.length - SHOWN} more (full list: re-run and pipe through jq, or query intelligence_items directly).`);
  }
  console.log(
    `\nGAP [CONFIRMED]: no deterministic transport-mode classifier exists in this repo to propose these ` +
    `(see this file's header — propose-classifications.mjs/apply-classifications.mjs cover source-level ` +
    `Axis 3/4/5 fields, never item-level transport_modes). Closing this requires either (a) an editor ` +
    `tagging these ${untagged.length} items directly, or (b) a new propose-only transport-mode classifier ` +
    `built on propose-classifications.mjs's ratify-before-write pattern — not built here (no LLM, and a ` +
    `text-classifier of this shape is real engineering work, not a same-file addition to an audit script).`
  );
}

// SOFT: always exit 0 — this is an editorial backlog measurement (wave-acceptance-audit.mjs's own
// precedent for a human-actionable, non-mechanical finding), never a build-blocking verdict.
process.exit(0);
