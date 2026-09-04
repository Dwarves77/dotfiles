// @ts-check
// api-transport — the ONE per-host document-API fetch body for federalregister.gov + ecfr.gov (Lane
// LEDGER-WALLS, 2026-09-04), factored OUT of src/lib/agent/canonical-pipeline.ts's `apiFetchForHost` so
// BOTH consumers call the SAME code — never a second hand-typed copy (CLAUDE.md "one body" rule):
//
//   - canonical-pipeline.ts's `apiFetchForHost` (the agent/grounding pipeline's RD-14 transport ladder,
//     step (d)) now DELEGATES here after its own scrape-hold gate (`assertFetchAllowed`) passes — that
//     gate, and the ladder's cache/dedup bookkeeping, stay in canonical-pipeline.ts (they are that
//     pipeline's own concern, not this module's); only the "make the actual API call and shape the
//     result" body moved.
//   - scripts/turns/run-ledger-consume.mjs's buildFetchDoc calls this module DIRECTLY for
//     federalregister.gov/ecfr.gov document URLs — the ledger-consume family has its own politeness gap
//     (LEDGER_CONSUME_FETCH_GAP_MS) as its equivalent throttle and does not go through the grounding
//     pipeline's scrape-hold gate (a different system; ledger-consume candidates are never part of an
//     item's grounding pool).
//
// WHY THIS TRANSPORT EXISTS AT ALL (RD-14, restated for this module's own consumers): federalregister.gov
// + eCFR return a "Request Access" CAPTCHA wall to a plain scraper on their HTML document pages (see
// access-wall.mjs's REQUEST_ACCESS_RE — confirmed live, ledger-consume export #5, 2026-09-04: 231 of 231
// fetched federalregister.gov document rows in that 400-row batch carried the shell), but BOTH hosts
// publish the SAME content through an official, unauthenticated JSON/XML API. `fetchDocumentApi` is the
// host-dispatching entry point `apiEndpointFor` (transport-escalation.mjs) already names as the "does this
// host have an API" predicate — reused here, never re-derived, so the two modules can never disagree on
// which hosts are API-routed.
//
// INJECTABLE `fetchImpl` (default the global `fetch`) so both callers, and this module's own tests, run
// with no real network. `max` is REQUIRED on every call (ADR-016's "a fetcher without a required cap
// silently reintroduces a storage cap" discipline, mirrored here rather than defaulted away).

import { htmlToText } from "../text/html-to-text.mjs";
import { cleanCtl } from "./charset-decode.mjs";
import { apiEndpointFor } from "./transport-escalation.mjs";
// hostFromUrl — the entity spine's ONE host normalizer (F30's url_host_derivation ratchet,
// docs/specs/08-flywheel-design.md §1.3): lowercased, www-stripped, never throws — reused here instead of
// a second hand-rolled `new URL(url).hostname.replace(/^www\./, "")` that could drift from it.
import { hostFromUrl } from "../entities/entity-id.mjs";

const UA = { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" };
const FETCH_TIMEOUT_MS = 25_000;

/** @param {string} full @param {number} max */
function clip(full, max) {
  const t = (cleanCtl(full) || "").replace(/\s+/g, " ").trim().slice(0, max);
  return { status: 200, text: t.length > 200 ? t : "", truncated: full.length > max, fullLength: full.length, cap: max };
}

/**
 * federalregister.gov: `/documents/YYYY/MM/DD/{DOCUMENT_NUMBER}/slug` → `/api/v1/documents/
 * {DOCUMENT_NUMBER}.json` (title, abstract, type, agencies, publication_date, full_text_xml_url,
 * body_html_url, raw_text_url) → that JSON's `raw_text_url` (the plain-text rendering of the document,
 * no HTML/CAPTCHA involved) — falling back to the JSON's own `title` + `abstract` when `raw_text_url` is
 * absent, or itself fails to fetch, or extracts to under the 200-char floor (still official content,
 * just thinner than the full text).
 * @param {string} url @param {{fetchImpl?: typeof fetch, max: number, apiBase?: string}} opts
 * @returns {Promise<{status:number,text:string,truncated:boolean,fullLength:number,cap:number}|null>}
 *   `null` when no document_number can be derived from the URL (the caller's HTML transports hold instead
 *   — the honest exhaustion path, never a silent success on a wall). */
export async function fetchFederalRegisterDocument(url, opts) {
  const { fetchImpl = fetch, max, apiBase = "https://www.federalregister.gov/api/v1" } = opts ?? {};
  if (typeof max !== "number") throw new Error("fetchFederalRegisterDocument requires opts.max (a char cap) — never defaulted.");
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean);
  const i = segs.indexOf("documents");
  const docNum = i >= 0 && segs.length > i + 4 ? segs[i + 4] : null;
  if (!docNum) return null;
  const jr = await fetchImpl(
    `${apiBase}/documents/${encodeURIComponent(docNum)}.json?fields[]=title&fields[]=abstract&fields[]=raw_text_url`,
    { headers: UA, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!jr.ok) return { status: jr.status, text: "", truncated: false, fullLength: 0, cap: max };
  const doc = /** @type {{title?:string, abstract?:string, raw_text_url?:string}} */ (await jr.json());
  if (doc.raw_text_url) {
    try {
      const tr = await fetchImpl(doc.raw_text_url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (tr.ok) {
        const c = clip(htmlToText(await tr.text()), max);
        if (c.text) return c;
      }
    } catch {
      /* fall through to the title+abstract summary — still official content, never thrown */
    }
  }
  const summary = [doc.title, doc.abstract].filter(Boolean).join(". ").trim();
  return { status: 200, text: summary.length > 200 ? summary.slice(0, max) : "", truncated: false, fullLength: summary.length, cap: max };
}

/**
 * eCFR versioner: full title XML as of a concrete date. `/on/YYYY-MM-DD/title-N/...` carries the
 * versioner date this endpoint needs; a bare `/current/title-N/...` has no date in the URL, so this
 * returns `null` (the caller's HTML transport holds — a future lane may resolve "current" to today's
 * date server-side, not attempted here).
 * @param {string} url @param {{fetchImpl?: typeof fetch, max: number, apiBase?: string}} opts
 * @returns {Promise<{status:number,text:string,truncated:boolean,fullLength:number,cap:number}|null>} */
export async function fetchEcfrTitle(url, opts) {
  const { fetchImpl = fetch, max, apiBase = "https://www.ecfr.gov/api" } = opts ?? {};
  if (typeof max !== "number") throw new Error("fetchEcfrTitle requires opts.max (a char cap) — never defaulted.");
  const u = new URL(url);
  const titleM = u.pathname.match(/title-(\d+)/);
  const dateM = u.pathname.match(/\/on\/(\d{4}-\d{2}-\d{2})\//);
  if (!titleM || !dateM) return null;
  const xr = await fetchImpl(
    `${apiBase}/versioner/v1/full/${dateM[1]}/title-${titleM[1]}.xml`,
    { headers: UA, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!xr.ok) return { status: xr.status, text: "", truncated: false, fullLength: 0, cap: max };
  return clip(htmlToText(await xr.text()), max);
}

/**
 * Host-dispatching entry point. Mirrors `apiEndpointFor`'s own host test (transport-escalation.mjs,
 * REUSED not re-derived) so this module and that predicate can never name a different set of API hosts.
 * @param {string} url @param {{fetchImpl?: typeof fetch, max: number, apiBase?: string}} opts
 * @returns {Promise<{status:number,text:string,truncated:boolean,fullLength:number,cap:number}|null>}
 *   `null` when the host has no API transport (per `apiEndpointFor`) OR the URL shape carries no usable
 *   document identifier for the host it does have. */
export async function fetchDocumentApi(url, opts) {
  const apiBase = opts?.apiBase ?? apiEndpointFor(url);
  if (!apiBase) return null;
  const host = hostFromUrl(url);
  if (/(^|\.)federalregister\.gov$/.test(host)) return fetchFederalRegisterDocument(url, { ...opts, apiBase });
  if (/(^|\.)ecfr\.gov$/.test(host)) return fetchEcfrTitle(url, { ...opts, apiBase });
  return null;
}
