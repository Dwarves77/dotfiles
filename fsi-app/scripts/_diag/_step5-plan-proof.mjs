// STEP 5.2 — run PLAN mode (read-only, no spend) on the proof candidates against the LIVE corpus. Emits the
// verdict table the operator reviews before authorizing Step 6 (apply). Run: node scripts/_diag/_step5-plan-proof.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const { planIntakeCycle } = await import("../../src/lib/intake/plan-intake.ts");
const sb = readClient();

const candidates = [
  { title: "Regulation (EU) 2020/1056 on electronic freight transport information (eFTI)", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056", item_type: "regulation" },
  { title: "Regulation (EU) 2024/1157 on shipments of waste", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1157", item_type: "regulation" },
  { title: "EUR-Lex portal homepage (seeded-bad portal root)", source_url: "https://eur-lex.europa.eu/", item_type: "regulation" },
];

const r = await planIntakeCycle(sb, candidates);
console.log(`\n═══ STEP 5 PLAN (read-only, no spend) — discovered ${r.discovered} · would_mint ${r.wouldMint} · would_reject ${r.wouldReject} ═══\n`);
for (const v of r.verdicts) {
  console.log(`• ${v.verdict.toUpperCase().padEnd(12)} "${v.title.slice(0, 54)}"`);
  console.log(`    entity_gate=[${v.entity_gate}]  congruence=[${v.congruence}]  dedup=[${v.dedup}]  relevance=[${v.relevance}]`);
  if (v.reason) console.log(`    reason: ${v.reason}`);
}
process.exit(0);
