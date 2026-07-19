// _b1-ground-sample.mjs — one-shot: ground the 3 B1-minted FR items through the ONE grounding
// contract (generateBriefWorkflow, F16 manual caller), sequentially, reporting each verdict.
// Population sample run 2026-07-19 (post holdings-keying fix). Item ids passed as argv.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow } = await jiti.import("../../src/workflows/generate-brief.ts");

const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: _b1-ground-sample.mjs <itemId> [...]"); process.exit(2); }

for (const id of ids) {
  console.log(`\n=== grounding ${id} ===`);
  try {
    const wf = await generateBriefWorkflow(id, false, "manual-intake-run");
    const step = (k) => wf.steps?.[k]?.detail ?? "";
    console.log(`status: ${wf.status}`);
    for (const k of ["preflight", "generate", "register", "section", "ground", "grow", "auditGate"]) {
      const d = step(k);
      if (d) console.log(`  ${k}: ${String(d).slice(0, 220)}`);
    }
  } catch (e) {
    console.log(`WORKFLOW HALT: ${e instanceof Error ? e.message : String(e)}`);
  }
}
