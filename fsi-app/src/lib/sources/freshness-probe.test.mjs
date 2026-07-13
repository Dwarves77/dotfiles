// @ts-check
// Tests for the freshness probe: pure compareFreshness + HEAD-only probeFreshness with an injected fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFreshness, probeFreshness } from "./freshness-probe.mjs";

const CAP = "2026-05-15T00:00:00Z";

test("compareFreshness: Last-Modified before capture -> fresh", () => {
  const r = compareFreshness({ fetchedAt: CAP }, { ok: true, lastModified: "2026-05-01T00:00:00Z" });
  assert.equal(r.status, "fresh");
});

test("compareFreshness: Last-Modified after capture -> changed", () => {
  const r = compareFreshness({ fetchedAt: CAP }, { ok: true, lastModified: "2026-07-01T00:00:00Z" });
  assert.equal(r.status, "changed");
});

test("compareFreshness: no Last-Modified -> unknown", () => {
  assert.equal(compareFreshness({ fetchedAt: CAP }, { ok: true }).status, "unknown");
});

test("compareFreshness: non-ok HEAD -> unknown", () => {
  assert.equal(compareFreshness({ fetchedAt: CAP }, { ok: false }).status, "unknown");
});

test("compareFreshness: stored etag match/mismatch is decisive", () => {
  assert.equal(compareFreshness({ fetchedAt: CAP, storedEtag: "W/\"abc\"" }, { ok: true, etag: "W/\"abc\"" }).status, "fresh");
  assert.equal(compareFreshness({ fetchedAt: CAP, storedEtag: "W/\"abc\"" }, { ok: true, etag: "W/\"zzz\"" }).status, "changed");
});

test("probeFreshness: HEAD success maps headers to a decision (body never fetched)", async () => {
  let method = null;
  const fetchImpl = async (_url, opts) => {
    method = opts.method;
    return { ok: true, status: 200, headers: { get: (h) => (h === "last-modified" ? "2026-05-01T00:00:00Z" : null) } };
  };
  const r = await probeFreshness("https://eur-lex.europa.eu/x", { fetchedAt: CAP }, { fetchImpl });
  assert.equal(method, "HEAD");
  assert.equal(r.status, "fresh");
  assert.equal(r.httpStatus, 200);
});

test("probeFreshness: a thrown/roadblocked HEAD degrades to unknown (continue on stored)", async () => {
  const fetchImpl = async () => { throw new Error("Cloudflare challenge"); };
  const r = await probeFreshness("https://blocked.example/x", { fetchedAt: CAP }, { fetchImpl });
  assert.equal(r.status, "unknown");
  assert.match(r.reason, /HEAD failed/);
});
