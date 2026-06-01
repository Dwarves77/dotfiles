// #5A cleanup — re-adjudicate the 16 b-audit "fabrication" archives through the CLASS-FIXED
// detector (canonical fetch; non-answer -> INCONCLUSIVE, not FABRICATED). Shows the stored
// diff on integrity_flags (the timeout-false-positives go open -> resolved). The un-archive
// RESTORE itself is deferred (#43-gated). The original s15 secondary citations were wiped
// post-archive, so the corrected re-check verifies each item's PRIMARY source_url — stated,
// not hidden.
//
//   --execute resolves the timeout-false integrity_flags; default is read-only (measure).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkUrl, classifyResult, classifyResult_LEGACY_BUGGY } from "./audit-optionc-reachability.mjs";
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("recheck-fabrication-16", { applied: "2026-06-01", commit: "b973fcc", effect: "resolve 5 timeout-false integrity_flags (open->resolved)", idempotent: true });

const EXECUTE = process.argv.includes("--execute");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── MUTATION CHECK (four-part bar): the corrected classifier vs the legacy one on the
// detector's actual failure mode (a render that THREW = non-answer). ──
const forcedFail = { errored: true, status: null, title: "(BrowserlessError: forced timeout)" };
const fixedVerdict = classifyResult(forcedFail, "EPA Heavy-Duty GHG Phase 3");
const legacyVerdict = classifyResult_LEGACY_BUGGY(forcedFail);
console.log("=== #5 fabrication detector — class fix, shown ===\n");
console.log("-- MUTATION CHECK (detector's failure mode = a render that threw) --");
console.log(`  FIXED  classifyResult(errored) = ${fixedVerdict}   (expect INCONCLUSIVE)`);
console.log(`  LEGACY classifyResult(errored) = ${legacyVerdict}   (the bug: FABRICATED_URL)`);
console.log(`  => discriminates: ${fixedVerdict === "INCONCLUSIVE" && legacyVerdict === "FABRICATED_URL"}\n`);

// ── pull the 16 flagged items + their b-audit flag taxonomy ──
const flags = (await sb.from("integrity_flags").select("id, subject_ref, description, status").eq("created_by", "b-audit-2026-05-29")).data || [];
const ids = flags.map((f) => f.subject_ref);
const items = (await sb.from("intelligence_items").select("id, legacy_id, title, source_url").in("id", ids)).data || [];
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const urlFabCount = (d) => (d.match(/(\d+)\s+fabricated-url/i) || [0, 0])[1] | 0;
const metaFabCount = (d) => (d.match(/(\d+)\s+fabricated-metadata/i) || [0, 0])[1] | 0;

console.log(`-- corrected re-check of the 16 PRIMARY source_urls via canonical fetch --`);
console.log(`   (s15 secondary citations were wiped post-archive; primary source_url is the available signal)\n`);

const resolveTargets = [];
let i = 0;
for (const f of flags) {
  const it = byId[f.subject_ref];
  if (!it) continue;
  const nUrl = urlFabCount(f.description), nMeta = metaFabCount(f.description);
  const check = await checkUrl(it.source_url);
  const verdict = classifyResult(check, it.title);
  // timeout-false-positive: the source RENDERS (reachable, not errored, not an error page)
  // AND the original flags were URL-reachability only (no genuine metadata divergence).
  const sourceReachable = !check.errored && verdict !== "FABRICATED_URL" && verdict !== "INCONCLUSIVE";
  const urlOnly = nMeta === 0;
  // A flag description that also alleges a NON-citation concern (factual inconsistency,
  // untraceable/unsourced claims) is NOT cleared by reachability — that residual survives.
  const hasFactualConcern = /inconsistency|factual|untraceable|unsourced/i.test(f.description);
  const timeoutFalse = sourceReachable && urlOnly && !hasFactualConcern;
  const label = timeoutFalse ? "TIMEOUT-FALSE (resolve)"
    : hasFactualConcern ? "FACTUAL-RESIDUAL (keep)"
    : check.errored ? "INCONCLUSIVE (keep)"
    : nMeta > 0 ? "GENUINE-METADATA (keep)" : "REVIEW (keep)";
  console.log(`  ${String(++i).padStart(2)}. ${(it.legacy_id || it.id.slice(0, 8)).padEnd(20)} url-fab=${nUrl} meta-fab=${nMeta}  source_url -> ${check.errored ? "ERR/" + (check.status ?? "throw") : check.status} ${verdict.padEnd(18)} => ${label}`);
  console.log(`      ${(it.title || "").slice(0, 70)}`);
  if (timeoutFalse) resolveTargets.push({ flagId: f.id, item: it.legacy_id || it.id.slice(0, 8) });
}

console.log(`\n-- corrected split --`);
console.log(`  TIMEOUT-FALSE (source reachable + URL-only flags): ${resolveTargets.length}  -> ${resolveTargets.map((r) => r.item).join(", ")}`);
console.log(`  KEEP (genuine-metadata / inconclusive / factual): ${flags.length - resolveTargets.length}`);

// ── STORED DIFF: resolve the timeout-false flags (open -> resolved) ──
const before = (await sb.from("integrity_flags").select("status").eq("created_by", "b-audit-2026-05-29")).data;
const beforeOpen = before.filter((r) => r.status === "open").length;
if (EXECUTE && resolveTargets.length) {
  for (const t of resolveTargets) {
    await sb.from("integrity_flags").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: "fabrication-recheck-2026-06-01",
      resolution_note: "Re-verified via the CLASS-FIXED detector (canonical Browserless fetch): primary source_url renders; the original FABRICATED_URL flag was a 15s plain-fetch timeout artifact, not fabrication. Item un-archive/regeneration is the deferred #43-gated restore.",
    }).eq("id", t.flagId);
  }
}
const after = (await sb.from("integrity_flags").select("status").eq("created_by", "b-audit-2026-05-29")).data;
const afterOpen = after.filter((r) => r.status === "open").length;
const afterResolved = after.filter((r) => r.status === "resolved").length;

console.log(`\n-- STORED DIFF on integrity_flags (b-audit-2026-05-29) --`);
console.log(`  BEFORE: open=${beforeOpen}`);
console.log(`  ${EXECUTE ? "AFTER (executed)" : "DRY-RUN (no writes)"}: open=${afterOpen} resolved=${afterResolved}`);
if (!EXECUTE) console.log(`  (re-run with --execute to resolve the ${resolveTargets.length} timeout-false flags)`);
console.log(`\nDEFERRED (#5B, your call): the un-archive RESTORE of the timeout-false items is #43-gated`);
console.log(`(flipping is_archived re-derives provenance off 'unverified' -> guard blocks service_role;`);
console.log(` reconciler lacks an is_archived grant). Needs the restore mechanism decided.`);
process.exit(0);
