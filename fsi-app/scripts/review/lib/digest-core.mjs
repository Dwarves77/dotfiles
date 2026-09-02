// digest-core.mjs — shared, pure, DB-less helpers for every ratification digest (Lane R1, 2026-09-02).
//
// WHY THIS EXISTS. The four review queues (927 `sources` rows stuck at status='provisional', 331
// `canonical_source_candidates` pending, 1,457 `portal_link_candidates` candidates, 91
// `coverage_gap_candidates` undispositioned) have never been worked because nobody can rule on 2,806
// individual ROWS in one sitting. A RATIFICATION DIGEST turns a queue into a small number of GROUPS —
// the unit an operator can actually decide on — each carrying a count, a few example rows, the evidence
// that matters, and a labelled recommendation. The operator edits one field (`decision`) per group in the
// emitted JSON; the matching `apply-<queue>.mjs` script turns that into row mutations. Nothing here reads
// or writes a database — every function takes rows already fetched and returns data, never an I/O call.
//
// This module is genuinely queue-agnostic: it knows nothing about `sources` vs `portal_link_candidates`.
// Each `lib/<queue>.mjs` module supplies the queue-specific grouping key, recommendation rule, example
// shape, and decision vocabulary; this module supplies the mechanics every queue shares (sorting groups
// deterministically, building the group envelope, rendering the two output files).

/**
 * Deterministic group ordering: by descending row count, then by key ascending (stable tie-break) so two
 * runs over the SAME rows always emit groups in the SAME order — a digest is a document under review;
 * its group order must not depend on object-iteration order or Map insertion order, both of which can
 * legitimately vary between two equivalent inputs.
 * @param {Array<{key:string,count:number}>} groups
 */
export function sortGroups(groups) {
  return [...groups].sort((a, b) => (b.count - a.count) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Build one group envelope. `rows` is every row already assigned to this group (grouping itself happens
 * in the caller — this only shapes the envelope every queue emits identically).
 * @param {{key:string, rows:any[], idOf:(row:any)=>string, recommendedDecision:string, exampleOf:(row:any)=>object, evidence?:object}} args
 */
export function buildGroup({ key, rows, idOf, recommendedDecision, exampleOf, evidence = {} }) {
  return {
    key,
    count: rows.length,
    row_ids: rows.map(idOf),
    recommended_decision: recommendedDecision,
    decision: null,
    rationale: null,
    evidence,
    examples: rows.slice(0, 3).map(exampleOf),
  };
}

/** Group rows by a pure key function, in one pass, without relying on Map iteration order downstream —
 *  callers still get `sortGroups` for a stable emission order. Returns a Map<key, rows[]>. */
export function partitionBy(rows, keyOf) {
  const m = new Map();
  for (const row of rows) {
    const k = keyOf(row);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(row);
  }
  return m;
}

/** The latest of a list of ISO timestamps (nullish entries ignored). Returns null if none present. */
export function latestIso(timestamps) {
  let best = null;
  for (const t of timestamps) {
    if (!t) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best ? best.toISOString() : null;
}

/**
 * Render the digest as Markdown: one section per group, ordered exactly as `groups` arrives (call
 * `sortGroups` first). Kept intentionally plain (no tables) so it reads well as a diff and in a terminal.
 * @param {{queueLabel:string, queueId:string, generatedAt:string, totalRows:number, groups:object[], decisionVocab:string[], applyScript:string, maintStep:string}} digest
 */
export function renderMarkdown(digest) {
  const { queueLabel, queueId, generatedAt, totalRows, groups, decisionVocab, applyScript, maintStep } = digest;
  const lines = [];
  lines.push(`# Ratification digest — ${queueLabel}`);
  lines.push("");
  lines.push(`Queue: \`${queueId}\` · generated ${generatedAt} · ${totalRows} row(s) in ${groups.length} group(s)`);
  lines.push("");
  lines.push(`Rule on each group by setting its \`decision\` field in the companion JSON to one of: ${decisionVocab.map((d) => `\`${d}\``).join(", ")}.`);
  lines.push(`Apply with: \`node ${applyScript} --apply --ruling <this-json-file>\` (dry by default). Wired into the \`${maintStep}\` maintenance step.`);
  lines.push("");
  for (const g of groups) {
    lines.push(`## ${g.key}`);
    lines.push("");
    lines.push(`- count: ${g.count}`);
    lines.push(`- recommended: **${g.recommended_decision}**`);
    for (const [k, v] of Object.entries(g.evidence || {})) {
      lines.push(`- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
    if (g.examples.length) {
      lines.push(`- examples:`);
      for (const ex of g.examples) {
        const title = ex.title || "(untitled)";
        lines.push(`  - ${title} — ${ex.url || "(no url)"}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The JSON ruling-file shape every apply-<queue>.mjs consumes. `groups` must already be in final order. */
export function buildRulingFile({ queueId, generatedAt, groups }) {
  return { queue: queueId, generated_at: generatedAt, groups };
}
