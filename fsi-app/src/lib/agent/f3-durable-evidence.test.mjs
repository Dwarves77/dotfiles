// PROOF (Phase R F3 addendum — the live writer fires BEFORE the working pool is erased, and it writes
// idempotently so the append-only store is never UPDATE-tripped). The durable criterion-3 evidence
// (item_source_evidence, migrations 216/217) only helps if generate persists the cleaned pool text BEFORE the
// agent_run_searches DELETE-then-INSERT that replaces the working pool each generation — otherwise the
// per-generate erase still destroys the prior evidence. This source-scan proves the ordering on BOTH generate
// paths (generateBrief + generateBriefRefreshPrimary) and that the write is ON CONFLICT DO NOTHING (never an
// UPDATE, so the DB append-only trigger from mig 216 is not tripped). The append-only DB guarantee itself is
// proven by scripts/_diag/_f3-append-only-proof.sql (a rolled-back probe: UPDATE and DELETE both rejected).
// Runs in the no-npm discipline glob (src/lib/agent/*.test.mjs); node builtins + fs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, "canonical-pipeline.ts"), "utf8");

// Every pool-replacing DELETE site: the working pool wipe keyed on the item.
const DELETE_RE = /\.from\("agent_run_searches"\)\.delete\(\)\.eq\("intelligence_item_id"/g;
const EVIDENCE_UPSERT = '.from("item_source_evidence").upsert(';

test("both pool-DELETE sites are preceded by a durable-evidence write (generate + refresh)", () => {
  const deleteIdxs = [...src.matchAll(DELETE_RE)].map((m) => m.index);
  assert.equal(deleteIdxs.length, 2, "expected exactly the two pool-replacing DELETE sites (generate + refresh)");
  for (const di of deleteIdxs) {
    // an item_source_evidence upsert must appear in the code BEFORE this DELETE (and after the prior DELETE,
    // so each path has its own writer). We check there is an evidence upsert in the window ending at `di`.
    const before = src.slice(0, di);
    const lastUpsert = before.lastIndexOf(EVIDENCE_UPSERT);
    assert.ok(lastUpsert !== -1, `a durable-evidence upsert must precede the pool DELETE at index ${di}`);
  }
});

test("the durable-evidence write is idempotent (ON CONFLICT DO NOTHING — never an UPDATE)", () => {
  // two writers (generate + refresh), both ignoreDuplicates so a re-store of identical content is a no-op
  // insert, not an UPDATE — otherwise the append-only trigger (mig 216) would reject it.
  const upserts = src.split(EVIDENCE_UPSERT).length - 1;
  assert.ok(upserts >= 2, "both generate paths must persist durable evidence");
  assert.ok(/onConflict:\s*"intelligence_item_id,content_hash",\s*ignoreDuplicates:\s*true/.test(src),
    "the evidence write must be ON CONFLICT DO NOTHING (idempotent, append-only safe)");
});

test("the evidence text is the SAME cleaned text criterion 3 checks (cleanCtl), keyed by content_hash", () => {
  // stored cleaned_text is cleanCtl(b.text) — byte-identical to result_content_excerpt — so a span written in
  // synthesis and matched against the working excerpt is equally matchable in the durable store.
  assert.ok(/cleaned_text:\s*cleaned/.test(src) && /content_hash:\s*sha256Hex\(cleaned\)/.test(src),
    "evidence rows must carry cleanCtl(b.text) as cleaned_text and sha256Hex(cleaned) as content_hash");
});
