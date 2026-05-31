// D3 Component A — outcome-assertion primitives.
//
// Each primitive asserts a CATEGORY, so the session failures it re-detects are
// INSTANCES that trip the category, NOT hardcoded signatures (design section 1(a)):
//   assertReadBack  — "operation reported success but persisted state differs"
//   fetchOk         — "non-2xx must not be read as success/absence"
//   observeFired    — "a gate's EFFECT, not its installation"
//   findRawSourceFetch — "diagnostics must call the canonical impl, not a raw fetch"
//
// VERDICT.INCONCLUSIVE and .UNCONFIRMABLE are DISTINCT from PASS by construction —
// nothing here collapses an undetermined result into a pass.

export const VERDICT = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  INCONCLUSIVE: "INCONCLUSIVE", // determinable-but-not-2xx etc. — never a pass
  UNCONFIRMABLE: "UNCONFIRMABLE", // effect could not be observed — never a pass
});

export class VerifyError extends Error {
  constructor(verdict, message, detail) {
    super(message);
    this.name = "VerifyError";
    this.verdict = verdict;
    this.detail = detail;
  }
}

const eqJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Takes ONLY a fresh read fn + the expected STORED value — never the mutation's
// own return. The API shape itself forbids trusting "success:true".
export async function assertReadBack(label, readBackFn, expected, opts = {}) {
  const eq = opts.eq || eqJSON;
  const actual = await readBackFn();
  return { label, verdict: eq(actual, expected) ? VERDICT.PASS : VERDICT.FAIL, expected, actual };
}

// Non-2xx → throws INCONCLUSIVE, so an empty/absent body from a 401/500 can never
// be interpreted as success. `doFetch` is injectable for testing.
export async function fetchOk(url, init = {}, doFetch = fetch) {
  const res = await doFetch(url, init);
  if (!res || typeof res.status !== "number") {
    throw new VerifyError(VERDICT.INCONCLUSIVE, `no response from ${url}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new VerifyError(
      VERDICT.INCONCLUSIVE,
      `non-2xx ${res.status} from ${url}: INCONCLUSIVE, not a pass`,
      { status: res.status }
    );
  }
  return res;
}

// probeFn returns { fired:boolean, evidence } — asserts the gate's EFFECT, not that
// it is "loaded". If the effect cannot be observed (probe throws) → UNCONFIRMABLE.
export async function observeFired(label, probeFn) {
  try {
    const r = await probeFn();
    return { label, verdict: r && r.fired ? VERDICT.PASS : VERDICT.FAIL, evidence: r && r.evidence };
  } catch (e) {
    return { label, verdict: VERDICT.UNCONFIRMABLE, error: String((e && e.message) || e) };
  }
}

// Lint (text-scan — acknowledged lower-confidence per design section 2): flags a raw
// fetch( of a variable/url that is NEITHER the canonical token NOR the model API.
export function findRawSourceFetch(sourceText, { canonicalToken } = {}) {
  const hits = [];
  sourceText.split(/\r?\n/).forEach((ln, i) => {
    if (!/\bfetch\s*\(/.test(ln)) return;
    if (/api\.anthropic\.com/.test(ln)) return; // model API, not source content
    if (canonicalToken && ln.includes(canonicalToken)) return; // routed through canonical
    if (/fetch\s*\(\s*[a-zA-Z_$]/.test(ln) || /fetch\s*\(\s*["'`]https?:\/\//.test(ln)) {
      hits.push({ line: i + 1, text: ln.trim() });
    }
  });
  return hits;
}
