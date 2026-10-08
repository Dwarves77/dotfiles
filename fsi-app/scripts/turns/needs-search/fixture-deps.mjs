// fixture-deps.mjs: the in-memory database the needs export and URL apply run over with --fixture <corpus.json>
// (lane G5-SEARCH). Built on the question-answers fixture database (reads, guardedInsert, guardedUpdateByIds over a
// plain { tables: { name: [rows] } } object), adding the three things the needs flow uses that it does not have: a
// `like` filter on reads (the flywheel-gap namespace read), registerSource (idempotent by institution key, the
// way scripts/lib/db.mjs registerSource is) and the portal candidate upsert (keyed on url).
//
// It does NOT model RLS, triggers or snapshots. The tests use it too, so what the CLIs do under --fixture is what
// the tests prove.

import { fixtureDeps as baseFixtureDeps } from "../question-answers/fixture-deps.mjs";
import { institutionKey, hostOf } from "../../lib/institution-key.mjs";

const pad = (n) => String(n).padStart(12, "0");

/**
 * @param {{tables:Record<string,object[]>, missing_columns?:Record<string,string[]>}} corpus
 */
export function fixtureDeps(corpus) {
  const base = baseFixtureDeps(corpus);
  let seq = 0;

  // The base Query supports eq / in / limit; a SQL LIKE (percent wildcard) is one more predicate on its filter list.
  const withLike = (match) => (match ? (q) => {
    q.like = (col, pattern) => {
      const re = new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
      q.filters.push((r) => typeof r[col] === "string" && re.test(r[col]));
      return q;
    };
    match(q);
  } : match);

  async function readAll(table, columns, opts = {}) {
    return base.readAll(table, columns, { ...opts, match: withLike(opts.match) });
  }

  async function registerSource(source, { cite } = {}) {
    if (!cite) throw new Error("fixture registerSource: cite required");
    if (!source?.url) throw new Error("fixture registerSource: source.url required");
    const rows = base.tables.sources ?? (base.tables.sources = []);
    const key = source.institutionKey || institutionKey(source.url);
    const hit = rows.find((s) => institutionKey(s.url) === key);
    if (hit) {
      if (hit.status !== "active") hit.status = "active";
      return { source_id: hit.id, created: false, host: hostOf(source.url) };
    }
    seq += 1;
    const id = `bbbbbbbb-0000-4000-8000-${pad(seq)}`;
    rows.push({ id, url: source.url, name: source.name || hostOf(source.url), base_tier: source.base_tier ?? 7, status: "active" });
    return { source_id: id, created: true, host: hostOf(source.url) };
  }

  async function upsertPortalCandidate(sourceId, link) {
    const rows = base.tables.portal_link_candidates ?? (base.tables.portal_link_candidates = []);
    const hit = rows.find((r) => r.url === link.url);
    if (hit) { hit.anchor_text = link.anchorText ?? hit.anchor_text; return { upserted: 1, failed: 0 }; }
    rows.push({ source_id: sourceId, url: link.url, anchor_text: link.anchorText ?? null, status: "candidate" });
    return { upserted: 1, failed: 0 };
  }

  return { ...base, readAll, registerSource, upsertPortalCandidate, committedVerdicts: new Map() };
}
