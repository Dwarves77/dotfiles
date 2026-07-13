// Correct the register-step-gap flag text (operator ruling 2026-07-13, register-step-gap unit item 2):
// cite the LIVE query, not the stale hardcoded "~847"/"841 baseline". The register-step-gap class fix
// (SC-13) has landed go-forward; the flag stays OPEN (the existing backlog flips on the next sanctioned
// grounding run), only its description is corrected. Guarded write (snapshots + cite), read-back verified.
//
// Usage: node fsi-app/scripts/correct-register-step-gap-flag.mjs [--apply]   (dry-run without --apply)
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");

const FLAG_ID = "c7f37ad2-b07f-486b-98ae-4c9730dfb873";
const NEW_DESCRIPTION =
  "Register-step class gap: grounding to a pool-source host NOT in the sources registry NULL-stamps the " +
  "FACT span. LIVE COUNT is query-not-value — run scripts/verify/unregistered-span-host-audit.mjs for the " +
  "current unregistered-span backlog (2,460 FACT spans / 325 items as of 2026-07-13; the hardcoded " +
  "'~847'/'841 baseline' is stale and superseded). GO-FORWARD CLASS FIX LANDED (SC-13, register-step-gap " +
  "unit, 2026-07-13): register-at-grounding is deterministic-only (codified host-class OR institution-" +
  "inherit; ambiguous hosts are NOT registered — surfaced here as null-tier-host worklist entries, never " +
  "minted a guessed tier). The existing backlog flips on the next sanctioned grounding run.";

const CITE = {
  skill: "source-credibility-model",
  reason: "register-step-gap unit item 2 (operator ruling 2026-07-13): correct the flag text to cite the live unregistered-span-host-audit query, not the stale hardcoded ~847; record that the SC-13 go-forward class fix landed.",
};

const before = await readAll("integrity_flags", "id,created_by,status,description", {
  match: (q) => q.eq("id", FLAG_ID),
});
if (!before.length) {
  console.error(`FAIL: flag ${FLAG_ID} not found.`);
  process.exit(1);
}
const b = before[0];
console.log(`FLAG ${FLAG_ID}  created_by=${b.created_by}  status=${b.status}`);
console.log(`BEFORE: ${b.description}\n`);
console.log(`AFTER : ${NEW_DESCRIPTION}\n`);

if (!APPLY) {
  console.log("DRY-RUN (no --apply). No write performed.");
  process.exit(0);
}

const res = await guardedUpdate(
  "integrity_flags",
  (qb) => qb.eq("id", FLAG_ID),
  { description: NEW_DESCRIPTION },
  { cite: CITE, select: "id,description" },
);

// Read-back verification (per the dispatch verification contract).
const after = await readAll("integrity_flags", "id,description", { match: (q) => q.eq("id", FLAG_ID) });
const desc = after[0]?.description ?? "";
// Exact-match: the stored description is the intended new text. (A naive /847/ check would false-fail on
// the new text's own "…'~847'/'841 baseline' is stale and superseded" clause, which quotes the old numbers
// precisely to mark them dead — so assert equality, not absence of the digits.)
const ok = res.updated === 1 && desc === NEW_DESCRIPTION && desc.includes("unregistered-span-host-audit.mjs");
console.log(`\nupdated=${res.updated}  snapshot=${res.snapshot}`);
console.log(`VERIFY: stored description == intended new text + cites the audit query -> ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
