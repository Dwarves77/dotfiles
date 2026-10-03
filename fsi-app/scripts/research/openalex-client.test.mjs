// openalex-client.test.mjs -- fixture-based, zero network, zero DB credential (lane L3 brief, "Tests,
// and the fire-once requirement"). Every test injects deps.fetch as a stub; nothing here reaches the
// real OpenAlex host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openAlexGet, fetchWorkByDoi, fetchWorkById, fetchAuthor, fetchInstitution, fetchInstitutionTopicStanding, OpenAlexError, CONFIG } from "./openalex-client.mjs";

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    statusText: String(status),
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  };
}

test("CONFIG exposes the default base url and a polite-pool email, no API key field anywhere", () => {
  assert.equal(CONFIG.baseUrl, "https://api.openalex.org");
  assert.match(CONFIG.email, /@/);
  assert.equal("apiKey" in CONFIG, false);
  assert.equal("key" in CONFIG, false);
});

test("openAlexGet appends mailto to every request url (polite pool, no key)", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { ok: true });
  };
  await openAlexGet("/works/W123", {}, { fetch: fetchStub, email: "test@example.com" });
  assert.match(capturedUrl, /mailto=test%40example\.com/);
});

test("openAlexGet passes through extra query params alongside mailto", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, {});
  };
  await openAlexGet("/works", { filter: "institutions.id:I1", group_by: "institutions.id" }, { fetch: fetchStub });
  assert.match(capturedUrl, /filter=institutions\.id%3AI1/);
  assert.match(capturedUrl, /group_by=institutions\.id/);
});

test("openAlexGet retries on 429 with backoff, then returns the eventual success body", async () => {
  let calls = 0;
  const waits = [];
  const fetchStub = async () => {
    calls += 1;
    if (calls < 3) return jsonResponse(429, {});
    return jsonResponse(200, { resolved: true });
  };
  const sleepStub = async (ms) => {
    waits.push(ms);
  };
  const result = await openAlexGet("/works/W1", {}, { fetch: fetchStub, sleep: sleepStub, maxRetries: 3, retryBaseMs: 10 });
  assert.deepEqual(result, { resolved: true });
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
  // Exponential backoff: second wait is strictly larger than the first (retryBaseMs * 2^attempt).
  assert.ok(waits[1] > waits[0]);
});

test("openAlexGet honors a Retry-After header over the exponential default", async () => {
  let calls = 0;
  const waits = [];
  const fetchStub = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(429, {}, { "retry-after": "2" });
    return jsonResponse(200, { ok: true });
  };
  await openAlexGet("/works/W1", {}, { fetch: fetchStub, sleep: async (ms) => waits.push(ms), retryBaseMs: 10 });
  assert.equal(waits[0], 2000);
});

test("openAlexGet gives up after maxRetries and raises OpenAlexError on a sustained 429", async () => {
  const fetchStub = async () => jsonResponse(429, {});
  await assert.rejects(
    () => openAlexGet("/works/W1", {}, { fetch: fetchStub, sleep: async () => {}, maxRetries: 2, retryBaseMs: 1 }),
    // After maxRetries exhausts, the loop's next 429 falls through to the !res.ok branch (429 is not ok).
    (err) => err instanceof OpenAlexError && err.status === 429,
  );
});

test("openAlexGet returns null on 404 (honest absence, never an error)", async () => {
  const fetchStub = async () => jsonResponse(404, {});
  const result = await openAlexGet("/works/W_does_not_exist", {}, { fetch: fetchStub });
  assert.equal(result, null);
});

test("openAlexGet raises OpenAlexError with the status and path on a non-404 failure", async () => {
  const fetchStub = async () => jsonResponse(500, {});
  await assert.rejects(
    () => openAlexGet("/works/W1", {}, { fetch: fetchStub }),
    (err) => err instanceof OpenAlexError && err.status === 500 && err.path === "/works/W1",
  );
});

test("openAlexGet throws a clear error when no fetch is injected and none is global", async () => {
  // Node 24 ships a global fetch, so this simulates its absence rather than relying on the real
  // network ever being reachable from a test run (zero network, per the brief's fire-once section).
  const originalFetch = globalThis.fetch;
  delete globalThis.fetch;
  try {
    await assert.rejects(() => openAlexGet("/works/W1", {}, {}), /no fetch implementation/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWorkByDoi normalizes a bare DOI, a doi: prefix, and a full doi.org URL to the same request path", async () => {
  const urls = [];
  const fetchStub = async (url) => {
    urls.push(url);
    return jsonResponse(200, { id: "W1" });
  };
  await fetchWorkByDoi("10.1234/abc", { fetch: fetchStub });
  await fetchWorkByDoi("doi:10.1234/abc", { fetch: fetchStub });
  await fetchWorkByDoi("https://doi.org/10.1234/abc", { fetch: fetchStub });
  const paths = urls.map((u) => new URL(u).pathname);
  assert.equal(paths[0], paths[1]);
  assert.equal(paths[1], paths[2]);
  assert.match(paths[0], /\/works\/https:\/\/doi\.org\/10\.1234\/abc$/);
});

test("fetchWorkByDoi returns null without calling fetch when doi is empty", async () => {
  let called = false;
  const fetchStub = async () => {
    called = true;
    return jsonResponse(200, {});
  };
  const result = await fetchWorkByDoi("", { fetch: fetchStub });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("fetchWorkById resolves against the bare OpenAlex id", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { id: "W2755950973" });
  };
  const result = await fetchWorkById("https://openalex.org/W2755950973", { fetch: fetchStub });
  assert.equal(result.id, "W2755950973");
  assert.match(new URL(capturedUrl).pathname, /\/works\/W2755950973$/);
});

test("fetchAuthor routes an ORCID iD through the /authors/https://orcid.org/... path", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { id: "A1" });
  };
  await fetchAuthor("0000-0002-1825-0097", { fetch: fetchStub });
  assert.match(new URL(capturedUrl).pathname, /\/authors\/https:\/\/orcid\.org\/0000-0002-1825-0097$/);
});

test("fetchAuthor routes a bare OpenAlex author id through the plain /authors/<id> path", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { id: "A123" });
  };
  await fetchAuthor("A123", { fetch: fetchStub });
  assert.match(new URL(capturedUrl).pathname, /\/authors\/A123$/);
});

test("fetchInstitution routes a ROR id through the /institutions/https://ror.org/... path", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { id: "I1" });
  };
  await fetchInstitution("02mb95055", { fetch: fetchStub });
  assert.match(new URL(capturedUrl).pathname, /\/institutions\/https:\/\/ror\.org\/02mb95055$/);
});

test("fetchInstitutionTopicStanding builds the topic-scoped group_by query and returns null for missing args", async () => {
  let capturedUrl = null;
  const fetchStub = async (url) => {
    capturedUrl = url;
    return jsonResponse(200, { group_by: [] });
  };
  await fetchInstitutionTopicStanding("I123", "T456", { fetch: fetchStub });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.pathname, "/works");
  assert.equal(parsed.searchParams.get("group_by"), "institutions.id");
  assert.match(parsed.searchParams.get("filter"), /institutions\.id:I123/);
  assert.match(parsed.searchParams.get("filter"), /topics\.id:T456/);

  assert.equal(await fetchInstitutionTopicStanding(null, "T456", { fetch: fetchStub }), null);
  assert.equal(await fetchInstitutionTopicStanding("I123", null, { fetch: fetchStub }), null);
});
