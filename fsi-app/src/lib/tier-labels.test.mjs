// Q-1 drift guard (surface_of pattern, reconciliation remediation 2026-07-11).
// (a) The ruled vocabulary is exactly what the ONE constant exports (legend wins:
//     T5 industry / T6 commercial-intel / T7 news-commentary; no STATUS words as tier labels).
// (b) No component re-introduces a private tier-label vocabulary: the forbidden strings
//     ('7: "Provisional"' shapes, the old ad-hoc vocab) must not appear outside this home.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

test("ruled tier vocabulary — the one constant", async () => {
  const { TIER_LABELS, tierLabelOf } = await import("./tier-labels.ts").catch(async () => {
    // node --test without a TS loader: parse the source instead.
    const src = readFileSync(resolve(HERE, "tier-labels.ts"), "utf8");
    const grab = (n) => new RegExp(`${n}:\\s*"([^"]+)"`).exec(src)?.[1];
    return { TIER_LABELS: { 1: grab(1), 2: grab(2), 3: grab(3), 4: grab(4), 5: grab(5), 6: grab(6), 7: grab(7) }, tierLabelOf: null };
  });
  assert.equal(TIER_LABELS[5], "Industry / Standards");
  assert.equal(TIER_LABELS[6], "Commercial Intelligence");
  assert.equal(TIER_LABELS[7], "News / Commentary");
  // No status word may masquerade as a tier label.
  for (const v of Object.values(TIER_LABELS)) {
    assert.ok(!/provisional|unverified|pending/i.test(v), `status word leaked into tier label: ${v}`);
  }
  if (tierLabelOf) assert.equal(tierLabelOf(null), "Unrated");
});

test("no stray tier-label vocabularies in components", () => {
  const offenders = [];
  const FORBIDDEN = [
    /7:\s*"Provisional"/,                 // the old badge map shape
    /case 7:\s*return "Other"/,           // the old AskAssistant vocab
    /label:\s*"Trade press"/,             // the old private TIER_DEFINITIONS vocab
    /T7 \(unverified\)/i,                 // legend status-word line
  ];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); continue; }
      if (!/\.(tsx?|mjs)$/.test(name) || /test/.test(name)) continue;
      const text = readFileSync(p, "utf8");
      for (const re of FORBIDDEN) if (re.test(text)) offenders.push(`${p} :: ${re}`);
    }
  };
  walk(join(SRC, "components"));
  assert.deepEqual(offenders, [], `stray tier vocabulary — import TIER_LABELS from src/lib/tier-labels.ts instead:\n${offenders.join("\n")}`);
});
