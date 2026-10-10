// live-candidates.mjs (lane SMOKE-3, 2026-10-10): the CHOOSER for the Live smoke gate's conditional invariants.
//
// WHY. SMOKE-2 added content invariants whose element exists only on some items: the Inferences section (an item
// with a visible inference), the Catalogue record chip (a record-grade item), the bias chips (an item whose source
// carries bias tags). It judged them over a FIXED small set of visited items (the first item on each list and the
// theme-chip item), so a conditional element absent from those few pages failed the gate whether or not the corpus
// held a single candidate. The gate was red on every production deployment from the commit that added it. A gate that
// is red from birth is noise that hides real failures.
//
// WHAT THIS MODULE DOES. For each conditional class it asks the LIVE DATA (through the service client, read-only) for
// the items that SHOULD show the element, and returns { count, visit, sample }:
//   count   how many customer-visible items are candidates (the number the HOLD / FAIL decision turns on);
//   visit   the detail paths the runner visits so the element is judged on an item that must carry it;
//   sample  up to three paths, printed in the diagnostic so a human can open one.
// live-content.mjs then decides: zero candidates is a named HOLD (absent data is expected during the population hold,
// CLAUDE.md rule 16), any candidate makes the invariant a hard FAIL if the element is missing from a candidate page.
//
// REUSE, not construction. The inference rule is inference-view.mjs selectCurrentInferences (the customer read's own
// pure rules: current, not superseded, customer-visible method) plus the display gate's two rules (not REFUTED, cited);
// the bias rule is bias-display.mjs hasBiasTags (the same test the chips apply); the path is item-links.ts
// itemDetailHref (the function every ledger uses). The reads are the customer read gate: verified, not archived.
//
// READ-ONLY. GET requests to PostgREST with the service-role key; it never writes. The key stays in this process and
// is never printed. The CLI (below) is run by .github/workflows/live-smoke.yml in its own step BEFORE the browser run,
// so the browser step carries no database credential. Without credentials the CLI writes an UNRESOLVED file and exits 0
// (the runner then reports the conditional invariants as an unresolved HOLD, never a pass and never a crash); with
// credentials, a failed read exits 1, because a resolver that cannot read must not look like an empty corpus.
//
//   node live-candidates.mjs   (env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIVE_SMOKE_CANDIDATES)

import { writeFileSync } from "node:fs";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { itemDetailHref } from "../../../src/lib/item-links.ts";
import { selectCurrentInferences, CUSTOMER_INFERENCE_METHOD_IDS } from "../../../src/lib/detail/inference-view.mjs";
import { hasBiasTags } from "../../../src/lib/credibility/bias-display.mjs";

/** The conditional classes. A requirement in live-content.mjs names one in its `candidate` field. */
export const CANDIDATE_CLASSES = Object.freeze({
  INFERENCE: "inference",
  RECORD: "record",
  BIAS: "bias",
});

/** Detail pages the runner visits per class (each costs two page loads, one per viewport). */
export const VISIT_PER_CLASS = 2;
/** Paths echoed in the diagnostic. */
export const SAMPLE_SIZE = 3;

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const IN_CHUNK = 100;
const ITEM_COLUMNS = "id,legacy_id,item_type,domain";

/** A PostgREST GET reader. `fetchFn` is injectable so the fixture proof never touches a network. */
export function restClient({ url, key, fetchFn = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, "");
  return async function rest(table, query) {
    const res = await fetchFn(`${base}/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${table} read failed: HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error(`${table} read failed: not a row array`);
    return body;
  };
}

/** Every page of a query. `query` must carry a stable `order=`. Bounded: MAX_PAGES * PAGE_SIZE rows. */
async function readAll(rest, table, query) {
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await rest(table, `${query}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

const chunks = (list, n) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

/** The customer-visible rows (verified, not archived) among `ids`, the customer read gate. */
async function visibleItemsByIds(rest, ids) {
  const rows = [];
  for (const part of chunks([...new Set(ids)].filter(Boolean), IN_CHUNK)) {
    rows.push(...(await rest("intelligence_items", `select=${ITEM_COLUMNS}&is_archived=eq.false&provenance_status=eq.verified&id=in.(${part.join(",")})&order=id.asc`)));
  }
  return rows;
}

/** The detail path of an item row (legacy id, else uuid; the surface by its own type and domain). */
export function pathOfItemRow(r) {
  return itemDetailHref({ id: r.legacy_id || r.id, type: r.item_type, domain: r.domain });
}

/** { count, visit, sample } from item rows. PURE. Rows are de-duplicated by id and ordered by id for a stable pick. */
export function summariseRows(rows) {
  const byId = new Map();
  for (const r of rows ?? []) if (r && typeof r.id === "string") byId.set(r.id, r);
  const paths = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map(pathOfItemRow);
  return { count: paths.length, visit: paths.slice(0, VISIT_PER_CLASS), sample: paths.slice(0, SAMPLE_SIZE) };
}

/**
 * The inference views a customer is shown for a set of inference_records rows, one view per row. PURE.
 * Reuses the customer read's own rules (selectCurrentInferences: current, not superseded, a customer-visible
 * method) and the display gate's two rules (admissibleForInference, use "display": not REFUTED, at least one citation).
 * That gate lives in a React file (InferenceClaim.tsx) a plain node process cannot import, so its two lines are
 * restated here and proven against the same cases in live-candidates.test.mjs.
 */
export function visibleInferenceViews(rows, supersededIds) {
  const out = [];
  for (const row of rows ?? []) {
    for (const v of selectCurrentInferences([row], supersededIds)) {
      if (v.statusToken === "REFUTED") continue;
      if (!Array.isArray(v.citedItemIds) || v.citedItemIds.length === 0) continue;
      out.push(v);
    }
  }
  return out;
}

/** Items that carry a visible inference: the visible items cited by a visible inference. */
export async function resolveInferenceCandidates(rest) {
  const rows = await readAll(
    rest,
    "inference_records",
    `select=inference_id,claim_text,status_token,confidence,cited_item_ids,origin_class,trigger_question_ref,method_id,admissibility,computed_at&admissibility=eq.current&method_id=in.(${CUSTOMER_INFERENCE_METHOD_IDS.join(",")})&order=inference_id.asc`,
  );
  const successors = await readAll(rest, "inference_records", "select=supersedes&supersedes=not.is.null&order=supersedes.asc");
  const superseded = new Set(successors.map((r) => r.supersedes).filter((x) => typeof x === "string"));
  const views = visibleInferenceViews(rows, superseded);
  const cited = views.flatMap((v) => v.citedItemIds);
  const summary = summariseRows(await visibleItemsByIds(rest, cited));
  // The count of zero must be checkable against the table itself: every row, how many are current, how many of those
  // use a customer-visible method, how many views survive the display gate, how many visible items they cite.
  const all = await readAll(rest, "inference_records", "select=inference_id,admissibility,method_id&order=inference_id.asc");
  return {
    ...summary,
    diag: {
      table_rows: all.length,
      current: all.filter((r) => r.admissibility === "current").length,
      current_customer_method: rows.length,
      visible_views: views.length,
      cited_visible_items: summary.count,
    },
  };
}

/** Record-grade items (the Catalogue record chip). */
export async function resolveRecordCandidates(rest) {
  const rows = await readAll(rest, "intelligence_items", `select=${ITEM_COLUMNS}&item_grade=eq.record&is_archived=eq.false&provenance_status=eq.verified&order=id.asc`);
  return summariseRows(rows);
}

/** Items whose primary source carries at least one usable bias tag (hasBiasTags, the chips' own test). */
export async function resolveBiasCandidates(rest) {
  const tagRows = await readAll(rest, "source_bias_tags", "select=source_id,dimension,tag,confidence&order=id.asc");
  const bySource = new Map();
  for (const t of tagRows) {
    if (!t || typeof t.source_id !== "string") continue;
    bySource.set(t.source_id, [...(bySource.get(t.source_id) ?? []), t]);
  }
  const sourceIds = [...bySource.keys()].filter((id) => hasBiasTags(bySource.get(id)));
  const rows = [];
  for (const part of chunks(sourceIds, IN_CHUNK)) {
    rows.push(...(await rest("intelligence_items", `select=${ITEM_COLUMNS}&is_archived=eq.false&provenance_status=eq.verified&source_id=in.(${part.join(",")})&order=id.asc`)));
  }
  return summariseRows(rows);
}

/** All classes. Throws on any failed read (the CLI turns that into exit 1). @returns {Promise<{resolved:true, classes:Record<string,{count:number,visit:string[],sample:string[]}>}>} */
export async function resolveCandidates(rest) {
  const [inference, record, bias] = await Promise.all([resolveInferenceCandidates(rest), resolveRecordCandidates(rest), resolveBiasCandidates(rest)]);
  return {
    resolved: true,
    classes: { [CANDIDATE_CLASSES.INFERENCE]: inference, [CANDIDATE_CLASSES.RECORD]: record, [CANDIDATE_CLASSES.BIAS]: bias },
  };
}

/** The file written when no database credential is present: the runner reports an unresolved HOLD, never a pass. */
export const unresolvedCandidates = (reason) => ({ resolved: false, reason, classes: {} });

/** The diagnostic lines the CLI prints: per class the count and up to three paths. PURE. */
export function candidateLines(c) {
  if (!c || c.resolved !== true) return [`candidates UNRESOLVED: ${c?.reason ?? "no candidate file"}`];
  return Object.entries(c.classes).map(
    ([k, v]) => `candidates ${k}: ${v.count} item(s)${v.sample.length ? `; e.g. ${v.sample.join(" ")}` : ""}${v.diag ? ` [${Object.entries(v.diag).map(([dk, dv]) => `${dk}=${dv}`).join(" ")}]` : ""}`,
  );
}

/** The CLI body, with the environment and the fetch injected. Returns the exit code. */
export async function runCandidatesCli({ env = process.env, fetchFn = globalThis.fetch, write = writeFileSync, log = console.log, logError = console.error } = {}) {
  const outPath = env.LIVE_SMOKE_CANDIDATES || "live-smoke-candidates.json";
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    write(outPath, `${JSON.stringify(unresolvedCandidates("no database credentials in this run"), null, 2)}\n`);
    log("live candidates: no database credentials, wrote an UNRESOLVED file (the conditional invariants will report an unresolved HOLD)");
    return 0;
  }
  try {
    const result = await resolveCandidates(restClient({ url, key, fetchFn }));
    write(outPath, `${JSON.stringify(result, null, 2)}\n`);
    for (const l of candidateLines(result)) log(l);
    return 0;
  } catch (e) {
    logError(`live candidates ERROR: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  runCandidatesCli().then((code) => process.exit(code));
}
