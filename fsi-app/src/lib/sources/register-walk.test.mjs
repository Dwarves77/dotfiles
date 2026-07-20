// @ts-check
// PROOF (B2 register-walk). Pure builders + dep-injected walkers, no network:
//   - URL builders reject bad dates; OJ date formats to DDMMYYYY; FR query carries range/type/fields.
//   - dateRange is inclusive, refuses reversed and unbounded (>366d) ranges.
//   - frDocsToLinks drops non-https rows and maps title+type+date into the anchor hint.
//   - walkEurlexOj: one bad day is RECORDED and the walk continues (weekend 404 is a normal outcome).
//   - walkFederalRegister: pagination stops on missing next_page_url; a page cap is NEVER silent —
//     droppedPages/totalPages report what was not collected (the no-silent-truncation rule for walks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ojDailyViewUrl, frDocumentsUrl, frDocsToLinks, dateRange, walkEurlexOj, walkFederalRegister } from "./register-walk.mjs";

test("ojDailyViewUrl: ISO date → DDMMYYYY param; bad date throws", () => {
  assert.equal(
    ojDailyViewUrl("2026-07-18"),
    "https://eur-lex.europa.eu/oj/daily-view/L-series/default.html?ojDate=18072026"
  );
  assert.match(ojDailyViewUrl("2026-01-02", "C"), /C-series.*ojDate=02012026/);
  assert.throws(() => ojDailyViewUrl("18/07/2026"), /bad ISO date/);
});

test("frDocumentsUrl: carries range, types, per_page cap, fields; bad date throws", () => {
  const u = new URL(frDocumentsUrl({ from: "2026-07-01", to: "2026-07-18", types: ["RULE", "PRORULE"], perPage: 5000 }));
  assert.equal(u.searchParams.get("conditions[publication_date][gte]"), "2026-07-01");
  assert.equal(u.searchParams.get("conditions[publication_date][lte]"), "2026-07-18");
  assert.deepEqual(u.searchParams.getAll("conditions[type][]"), ["RULE", "PRORULE"]);
  assert.equal(u.searchParams.get("per_page"), "1000", "per_page must cap at the API max");
  assert.ok(u.searchParams.getAll("fields[]").includes("html_url"));
  assert.throws(() => frDocumentsUrl({ from: "bad", to: "2026-07-18" }), /bad ISO date/);
});

test("dateRange: inclusive; refuses reversed and unbounded ranges", () => {
  assert.deepEqual(dateRange("2026-07-17", "2026-07-19"), ["2026-07-17", "2026-07-18", "2026-07-19"]);
  assert.deepEqual(dateRange("2026-07-19", "2026-07-19"), ["2026-07-19"]);
  assert.throws(() => dateRange("2026-07-20", "2026-07-19"), /after/);
  assert.throws(() => dateRange("2020-01-01", "2026-07-19"), /unbounded/);
});

test("frDocsToLinks: https-only, anchor carries title + type + date", () => {
  const links = frDocsToLinks({
    results: [
      { html_url: "https://www.federalregister.gov/documents/2026/07/17/2026-1/x", title: "GHG Standards Phase 4", type: "Rule", publication_date: "2026-07-17" },
      { html_url: "ftp://bad", title: "nope" },
      { title: "no url at all" },
    ],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0].url, "https://www.federalregister.gov/documents/2026/07/17/2026-1/x");
  assert.match(links[0].anchorText, /GHG Standards Phase 4 — Rule 2026-07-17/);
});

test("walkEurlexOj: a failed day is recorded, the walk continues, persist receives extracted links", async () => {
  const persisted = [];
  const html = `<html><body><a href="/legal-content/EN/TXT/?uri=OJ:L_202601778">Regulation (EU) 2026/1778</a></body></html>`;
  const r = await walkEurlexOj(
    {
      fetchHtml: async (url) => { if (url.includes("18072026")) throw new Error("HTTP 404"); return html; },
      persist: async (links) => { persisted.push(...links); return { upserted: links.length, failed: 0 }; },
    },
    { from: "2026-07-17", to: "2026-07-18" }
  );
  assert.equal(r.days.length, 2);
  assert.equal(r.days[0].error, null);
  assert.ok(r.days[0].extracted >= 1, "instrument link extracted from the daily view");
  assert.match(r.days[1].error, /404/);
  assert.equal(r.upserted, persisted.length);
});

test("walkEurlexOj: uncapped by default (R2 no-cap rule) — a >40-link day is not floored; a finite cap still bounds", async () => {
  // A daily view listing 50 distinct instruments: uncapped must extract all 50, not DEFAULT_CAP=40.
  const many = Array.from({ length: 50 }, (_, i) =>
    `<a href="/legal-content/EN/TXT/?uri=OJ:L_2026${String(i).padStart(4, "0")}">Regulation ${i}</a>`).join("");
  const rUncapped = await walkEurlexOj(
    { fetchHtml: async () => `<html><body>${many}</body></html>`, persist: async (l) => ({ upserted: l.length, failed: 0 }) },
    { from: "2026-07-17", to: "2026-07-17" }
  );
  assert.equal(rUncapped.days[0].extracted, 50, "uncapped day extracts every listed instrument, not 40");
  // An explicit finite cap (a probe) still bounds.
  const rCapped = await walkEurlexOj(
    { fetchHtml: async () => `<html><body>${many}</body></html>`, persist: async (l) => ({ upserted: l.length, failed: 0 }) },
    { from: "2026-07-17", to: "2026-07-17", cap: 10 }
  );
  assert.equal(rCapped.days[0].extracted, 10, "a finite cap still bounds a probe walk");
});

test("walkFederalRegister: pages until next_page_url absent; page cap reports droppedPages, never silent", async () => {
  const mkPage = (n, hasNext, totalPages) => ({
    count: 42, total_pages: totalPages,
    next_page_url: hasNext ? `next-${n + 1}` : null,
    results: [{ html_url: `https://www.federalregister.gov/documents/d${n}`, title: `Doc ${n}` }],
  });
  // natural stop (2 pages, no cap hit)
  const a = await walkFederalRegister(
    { fetchJson: async (u) => (u.includes("page=1") ? mkPage(1, true, 2) : mkPage(2, false, 2)), persist: async (l) => ({ upserted: l.length, failed: 0 }) },
    { from: "2026-07-01", to: "2026-07-18", maxPages: 5 }
  );
  assert.equal(a.pages.length, 2);
  assert.equal(a.droppedPages, 0);
  // cap hit (10 total pages, cap 2) — the drop is REPORTED
  const b = await walkFederalRegister(
    { fetchJson: async (u) => { const m = u.match(/page=(\d+)/); const n = Number(m?.[1] ?? 1); return mkPage(n, true, 10); }, persist: async (l) => ({ upserted: l.length, failed: 0 }) },
    { from: "2026-07-01", to: "2026-07-18", maxPages: 2 }
  );
  assert.equal(b.pages.length, 2);
  assert.equal(b.totalPages, 10);
  assert.equal(b.droppedPages, 8, "a bounded walk must SAY what it did not collect");
});
