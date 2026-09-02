#!/usr/bin/env node
// build-review-digests.mjs — the read-only ratification-digest builder for the four never-worked review
// queues (Lane R1, 2026-09-02). Reads each queue's live rows, groups them at the DECISION's unit (a rule,
// not a row), and writes one Markdown digest + one JSON ruling file per queue. Writes NOTHING to the
// database — this script only ever calls `readAll` (READS, unguarded per scripts/lib/db.mjs's own
// convention); the ruling JSON it emits is the file an operator edits, and `apply-<queue>.mjs` is the
// only thing that ever writes.
//
// USAGE:
//   node scripts/review/build-review-digests.mjs --out docs/ratifications/2026-09
//   node scripts/review/build-review-digests.mjs --out /tmp/digests --queue provisional-sources
//
// See docs/ratifications/2026-09/README.md for what a digest is, how to rule on one, and which apply
// script / maintenance step consumes the result.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, buildRulingFile } from "./lib/digest-core.mjs";
import * as ProvisionalSources from "./lib/provisional-sources.mjs";
import * as CanonicalCandidates from "./lib/canonical-candidates.mjs";
import * as PortalLinks from "./lib/portal-links.mjs";
import * as CoverageGaps from "./lib/coverage-gaps.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

// Each entry: the queue module (grouping/recommendation), the apply script this digest names, and the
// MAINT step (fsi-app/scripts/maintenance/**, .github/workflows/maintenance.yml) the coordinator wires up
// to run it. MAINT step names are NAMED here as the intended wiring point — this lane's write set does
// not include maintenance.yml, so wiring the step itself is a follow-up outside this lane (see the report).
export const QUEUES = [
  { module: ProvisionalSources, applyScript: "scripts/review/apply-provisional-sources.mjs", maintStep: "review-apply-provisional-sources" },
  { module: CanonicalCandidates, applyScript: "scripts/review/apply-canonical-candidates.mjs", maintStep: "review-apply-canonical-candidates" },
  { module: PortalLinks, applyScript: "scripts/review/apply-portal-links.mjs", maintStep: "review-apply-portal-links" },
  { module: CoverageGaps, applyScript: "scripts/review/apply-coverage-gaps.mjs", maintStep: "review-apply-coverage-gaps" },
];

/**
 * Build one queue's digest (pure given its inputs — no I/O here; the caller supplies `rows` and, for
 * portal-links only, `sourceHostById`).
 * @returns {{markdown:string, ruling:object}}
 */
export function buildQueueDigest(entry, rows, { generatedAt, sourceHostById } = {}) {
  const { module: m, applyScript, maintStep } = entry;
  const groups = m.QUEUE_ID === PortalLinks.QUEUE_ID ? m.groupRows(rows, sourceHostById) : m.groupRows(rows);
  const ruling = buildRulingFile({ queueId: m.QUEUE_ID, generatedAt, groups });
  const markdown = renderMarkdown({
    queueLabel: m.QUEUE_LABEL,
    queueId: m.QUEUE_ID,
    generatedAt,
    totalRows: rows.length,
    groups,
    decisionVocab: m.ALLOWED_DECISIONS,
    applyScript,
    maintStep,
  });
  return { markdown, ruling };
}

/**
 * @param {{out: string, queue?: string, now?: string}} opts
 * @param {{readAll: Function}} deps
 */
export async function main({ out, queue, now } = {}, deps) {
  if (!out) throw new Error("build-review-digests: --out <dir> is required.");
  const { readAll } = deps;
  const generatedAt = now ?? new Date().toISOString();
  const targets = queue ? QUEUES.filter((q) => q.module.QUEUE_ID === queue) : QUEUES;
  if (queue && targets.length === 0) throw new Error(`build-review-digests: unknown --queue "${queue}"`);

  mkdirSync(out, { recursive: true });
  const summary = [];
  for (const entry of targets) {
    const m = entry.module;
    const rows = await readAll(m.TABLE, m.SELECT_COLUMNS, { match: m.matchQueue });
    let sourceHostById;
    if (m === PortalLinks) {
      const sourceRows = await readAll("sources", "id,url");
      const { hostOf } = await import("../lib/institution-key.mjs");
      sourceHostById = new Map(sourceRows.map((s) => [s.id, hostOf(s.url)]));
    }
    const { markdown, ruling } = buildQueueDigest(entry, rows, { generatedAt, sourceHostById });
    const mdPath = join(out, `${m.QUEUE_ID}.digest.md`);
    const jsonPath = join(out, `${m.QUEUE_ID}.ruling.json`);
    writeFileSync(mdPath, markdown);
    writeFileSync(jsonPath, JSON.stringify(ruling, null, 2) + "\n");
    console.log(`[review-digests] ${m.QUEUE_ID}: ${rows.length} row(s) -> ${ruling.groups.length} group(s) -> ${mdPath}`);
    summary.push({ queue: m.QUEUE_ID, rows: rows.length, groups: ruling.groups.length, mdPath, jsonPath });
  }
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const queueIdx = args.indexOf("--queue");
  const queue = queueIdx >= 0 ? args[queueIdx + 1] : undefined;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[review-digests] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll } = await import("../lib/db.mjs");
  main({ out, queue }, { readAll }).catch((e) => {
    console.error("[review-digests] fatal:", e);
    process.exit(1);
  });
}
