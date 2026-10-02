// openalex-client.mjs -- Lane L3 (Research source-authority client, narrowed), 2026-10-02.
// Thin fetch wrapper over the free, no-key OpenAlex REST API (/works, /authors, /institutions).
// Spec ref: docs/specs/03-research.md section 4, Score 2 ("source authority, computable, free data").
//
// WHY THIS EXISTS. Prior-art check (lane-common-contract "Prior art", binding 2026-09-17): grep for
// openalex/OpenAlex/ror.org/ORCID across fsi-app/src and fsi-app/scripts turned up ORCID checksum
// validation (src/lib/entities/crosswalk.mjs) and several honest "not computed here, needs OpenAlex/ROR"
// comments (CredibilityChipAuthority.tsx, record-facts-research.mjs, record-facts.mjs, MINT-RUNBOOK.md,
// RESEARCH-SWEEP.md) but no OpenAlex HTTP client anywhere in the repo. Nothing to reuse for the client
// itself; this module is net new.
//
// WHAT IT IS NOT. Not a scorer -- see authority-score.mjs for the pure function that turns these raw API
// shapes into the spec's distribution. This module only knows how to ask OpenAlex a question and get an
// answer back, with retry/backoff and the polite-pool identification OpenAlex's own usage policy asks
// for (https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication). No API key exists
// or is needed; $0 per lane-common-contract section 0 and this lane's own R14 section.
//
// DEPS INJECTION (pattern: fsi-app/scripts/mint/screen-reconcile-records.mjs's injected-deps shape, read
// first per the brief). Every function here takes an optional `deps` object so tests run with zero
// network: `deps.fetch` defaults to the global `fetch` (Node 24 ships one natively), `deps.sleep`
// defaults to a real setTimeout-based sleep, `deps.email`/`deps.baseUrl`/`deps.maxRetries`/
// `deps.retryBaseMs` override the defaults below. A test passes a `deps.fetch` stub that returns
// recorded fixture JSON and never touches the network.

const DEFAULT_BASE_URL = "https://api.openalex.org";
// Polite-pool contact: reuses the platform's existing public contact address (already live on
// src/app/privacy/page.tsx) rather than inventing a new credential-shaped value or the operator's own
// address (CLAUDE.md rule 9: no credentials in the repo -- an email is not a credential, but there is
// no reason to use a personal one when a public platform address already exists). Overridable via env
// for a future dedicated research-ops mailbox.
const DEFAULT_EMAIL = process.env.OPENALEX_POLITE_EMAIL || "privacy@carosledge.com";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 500;

/** Raised for any non-429, non-2xx OpenAlex response. Carries the HTTP status so callers can special-case 404. */
export class OpenAlexError extends Error {
  /** @param {string} message @param {number} status @param {string} path */
  constructor(message, status, path) {
    super(message);
    this.name = "OpenAlexError";
    this.status = status;
    this.path = path;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string} path @param {Record<string, string|number|undefined|null>} params @param {{baseUrl?: string, email?: string}} opts */
function buildUrl(path, params, opts) {
  const url = new URL(path, opts.baseUrl ?? DEFAULT_BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.set("mailto", opts.email ?? DEFAULT_EMAIL);
  return url.toString();
}

/**
 * GET a path from OpenAlex and parse the JSON body, retrying on 429 with backoff. Returns `null` on a
 * 404 (honest absence -- a DOI/author/institution that OpenAlex does not carry is not an error this
 * module raises; the caller treats it exactly like any other unresolved record, per CLAUDE.md rule 2's
 * "unknown, never a guessed tier").
 * @param {string} path
 * @param {Record<string, string|number|undefined|null>} params
 * @param {{fetch?: Function, sleep?: Function, email?: string, baseUrl?: string, maxRetries?: number, retryBaseMs?: number}} [deps]
 * @returns {Promise<object|null>}
 */
export async function openAlexGet(path, params, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseMs = deps.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  if (typeof fetchImpl !== "function") {
    throw new Error("openalex-client: no fetch implementation available (inject deps.fetch in tests; Node 24+ provides a global fetch at runtime)");
  }
  const url = buildUrl(path, params, deps);

  let attempt = 0;
  for (;;) {
    const res = await fetchImpl(url);
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfterHeader = typeof res.headers?.get === "function" ? res.headers.get("retry-after") : null;
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : retryBaseMs * 2 ** attempt;
      await sleep(waitMs);
      attempt += 1;
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new OpenAlexError(`OpenAlex request failed: ${res.status} ${res.statusText ?? ""} for ${path}`, res.status, path);
    }
    return res.json();
  }
}

/**
 * Resolve one work by DOI. Accepts a bare DOI, a `doi:` prefix, or a full `https://doi.org/...` URL --
 * all three forms appear in this corpus's forward-event and citation data.
 * @param {string} doi
 * @param {object} [deps]
 * @returns {Promise<object|null>} the OpenAlex work object, or null when unresolved
 */
export async function fetchWorkByDoi(doi, deps = {}) {
  if (!doi) return null;
  const normalized = String(doi).replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:/i, "").trim();
  if (!normalized) return null;
  return openAlexGet(`/works/https://doi.org/${normalized}`, {}, deps);
}

/**
 * Resolve one work by its own OpenAlex id (e.g. "W2755950973" or the full URL form).
 * @param {string} openAlexWorkId
 * @param {object} [deps]
 */
export async function fetchWorkById(openAlexWorkId, deps = {}) {
  if (!openAlexWorkId) return null;
  const id = String(openAlexWorkId).replace(/^https?:\/\/openalex\.org\//i, "");
  return openAlexGet(`/works/${id}`, {}, deps);
}

/**
 * Resolve one author, by OpenAlex id ("A...") or by a bare/full ORCID iD.
 * @param {string} idOrOrcid
 * @param {object} [deps]
 */
export async function fetchAuthor(idOrOrcid, deps = {}) {
  if (!idOrOrcid) return null;
  const raw = String(idOrOrcid).replace(/^https?:\/\/openalex\.org\//i, "");
  const isOrcid = /^(https?:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(raw);
  const path = isOrcid
    ? `/authors/https://orcid.org/${raw.replace(/^https?:\/\/orcid\.org\//i, "")}`
    : `/authors/${raw}`;
  return openAlexGet(path, {}, deps);
}

/**
 * Resolve one institution, by OpenAlex id ("I...") or by a bare/full ROR id.
 * @param {string} idOrRor
 * @param {object} [deps]
 */
export async function fetchInstitution(idOrRor, deps = {}) {
  if (!idOrRor) return null;
  const raw = String(idOrRor).replace(/^https?:\/\/openalex\.org\//i, "");
  const isRor = /^(https?:\/\/ror\.org\/)?0[a-z0-9]{8}$/i.test(raw);
  const path = isRor
    ? `/institutions/https://ror.org/${raw.replace(/^https?:\/\/ror\.org\//i, "")}`
    : `/institutions/${raw}`;
  return openAlexGet(path, {}, deps);
}

/**
 * Topic-scoped institutional standing (spec-03 section 4: "institution FWCI in the specific topic,
 * in-topic works count, topic share. Prevents 'MIT said it' when MIT has no freight-decarbonisation
 * footprint"). Thin wrapper over OpenAlex's own `/works` group-by-institution-filtered-by-topic query;
 * returns the raw group-by response, left for authority-score.mjs to interpret (this module does no
 * scoring).
 * @param {string} institutionOpenAlexId
 * @param {string} topicId
 * @param {object} [deps]
 */
export async function fetchInstitutionTopicStanding(institutionOpenAlexId, topicId, deps = {}) {
  if (!institutionOpenAlexId || !topicId) return null;
  return openAlexGet(
    "/works",
    { group_by: "institutions.id", filter: `institutions.id:${institutionOpenAlexId},topics.id:${topicId}` },
    deps,
  );
}

export const CONFIG = Object.freeze({
  baseUrl: DEFAULT_BASE_URL,
  email: DEFAULT_EMAIL,
  maxRetries: DEFAULT_MAX_RETRIES,
  retryBaseMs: DEFAULT_RETRY_BASE_MS,
});
