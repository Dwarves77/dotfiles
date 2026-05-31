/**
 * sprint4-18-parser-check.mjs  (Sprint 4 Block 1 — task 1.8 synthetic check)
 *
 * Compiles src/lib/agent/parse-output.ts and runs the Claim Provenance Ledger
 * extraction against synthetic agent output. Pure in-memory: no DB, no API, no
 * spend. Asserts the parser:
 *   - extracts a well-formed ledger into ParsedAgentOutput.claims
 *   - strips the ledger block AND the YAML from the stored body
 *   - validates FACT grounding (span + id/url), rejecting a malformed FACT
 *   - cross-links source_url -> agent_run_searches.id
 *   - returns [] when no ledger block is present (additive / pre-Sprint-4)
 *
 * Exit 0 = all assertions pass; exit 1 = a check failed.
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
process.chdir(APP_ROOT);

mkdirSync("./.parser-check-out", { recursive: true });
writeFileSync("./.parser-check-out/tsconfig.json", JSON.stringify({
  compilerOptions: { target: "es2022", module: "es2022", moduleResolution: "node", esModuleInterop: true, rootDir: "../src/lib/agent", outDir: "./out", strict: false },
  include: ["../src/lib/agent/parse-output.ts"],
}));
execSync("npx tsc -p ./.parser-check-out/tsconfig.json", { stdio: "inherit" });
const mod = await import(`file://${resolve(APP_ROOT, ".parser-check-out", "out", "parse-output.js")}`);
const { parseAgentOutput, extractClaimLedger, crossLinkClaimSources } = mod;

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) { console.log(`  [PASS] ${name}`); }
  else { console.log(`  [FAIL] ${name} ${detail}`); failures++; }
}

const FACT_UUID = "a1b2c3d4-e5f6-4789-9abc-def012345678";
const YAML = `---
severity: ACTION REQUIRED
priority: CRITICAL
urgency_tier: watch
format_type: regulatory_fact_document
topic_tags: [packaging]
signal_band: null
theme: null
operational_scenario_tags: [packaging-EPR-registration]
compliance_object_tags: [importer]
related_items: []
intersection_summary: null
sources_used: [${FACT_UUID}]
last_regenerated_at: 2026-05-29T12:00:00Z
regeneration_skill_version: "2026-05-27"
---`;

// ── case 1: well-formed output with a 4-record ledger ──
const ledger1 = `<<<CLAIM_PROVENANCE_LEDGER
[
  {"section": "8", "claim_text": "Serial identification required from 1 January 2030.", "claim_kind": "FACT", "source_span": "shall bear a unique identifier from 1 January 2030", "source_id": "${FACT_UUID}", "source_url": "https://eur-lex.europa.eu/eli/reg/2025/40", "slot_key": "primary_deadline"},
  {"section": "8", "claim_text": "Penalty not sourced.", "claim_kind": "GAP", "source_span": null, "source_id": null, "source_url": null, "slot_key": "penalty_summary"},
  {"section": "4", "claim_text": "Forwarder obligation under Art. 8 unsettled.", "claim_kind": "LEGAL", "source_span": null, "source_id": null, "source_url": null, "slot_key": "jurisdictional_scope"},
  {"section": "8", "claim_text": "Air-priority workspaces hit first.", "claim_kind": "ANALYSIS", "source_span": null, "source_id": null, "source_url": null, "slot_key": null}
]
CLAIM_PROVENANCE_LEDGER>>>`;
const raw1 = `# Brief Body\n\nSome prose here. *Analytical inference:* air-priority hits first.\n\n## New Sources Identified\n| n | u | 1 | why |\n\n${ledger1}\n\n${YAML}`;

console.log("case 1 — well-formed ledger:");
const out1 = parseAgentOutput(raw1);
check("claims extracted (4)", out1.claims.length === 4, `got ${out1.claims.length}`);
check("kinds correct", JSON.stringify(out1.claims.map((c) => c.claim_kind)) === JSON.stringify(["FACT", "GAP", "LEGAL", "ANALYSIS"]));
check("FACT has span + source_id", !!out1.claims[0].source_span && !!out1.claims[0].source_id);
check("body strips ledger sentinel", !out1.body.includes("CLAIM_PROVENANCE_LEDGER"));
check("body strips YAML", !out1.body.includes("regeneration_skill_version"));
check("body keeps prose", out1.body.includes("Some prose here"));
check("metadata parsed", out1.metadata.priority === "CRITICAL");

// ── case 2: cross-link source_url -> search id ──
console.log("case 2 — cross-link:");
const searches = [{ id: "11111111-2222-4333-8444-555555555555", result_url: "https://eur-lex.europa.eu/eli/reg/2025/40" }];
const linked = crossLinkClaimSources(out1.claims, searches);
check("FACT search_result_id stamped", linked[0].search_result_id === "11111111-2222-4333-8444-555555555555", `got ${linked[0].search_result_id}`);
check("non-matching claim unstamped", linked[2].search_result_id === null);
check("input not mutated", out1.claims[0].search_result_id === null);

// ── case 3: malformed FACT (missing span) must throw ──
console.log("case 3 — malformed FACT rejected:");
const badLedger = `<<<CLAIM_PROVENANCE_LEDGER
[{"section": "8", "claim_text": "Ungrounded.", "claim_kind": "FACT", "source_span": null, "source_id": "${FACT_UUID}", "source_url": null, "slot_key": "primary_deadline"}]
CLAIM_PROVENANCE_LEDGER>>>`;
let threw = false;
try { extractClaimLedger(`body\n${badLedger}\n${YAML}`); } catch (e) { threw = true; }
check("missing-span FACT throws", threw);

// ── case 4: no ledger block -> [] ──
console.log("case 4 — no ledger present:");
const out4 = parseAgentOutput(`# Brief\n\nProse only.\n\n${YAML}`);
check("claims empty when no ledger", out4.claims.length === 0);
check("body intact", out4.body.includes("Prose only"));

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} — 1.8 synthetic parser check`);
rmSync("./.parser-check-out", { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
