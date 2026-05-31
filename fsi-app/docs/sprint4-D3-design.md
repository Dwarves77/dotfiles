# D3 — Verification-Layer Hardening: FINAL DESIGN (approval artifact)

**Status:** DESIGN for approval. Build nothing until approved. **D3 is the FIRST build — before the canonical fetch fix.** A fetch fix verified by the current regime (which reported the fail-open hook fine, criterion-6 working, the 401 a pass, the dry-run solid) is a fix we can't confirm. D3 is the precondition for trusting any subsequent build, including itself.

**Sequence (locked):** D3 design → D3 build → **both** acceptance tests pass → Block-1 re-audit (= Acceptance Test 2) → canonical fetch fix → narrowed Phase 1.5 (recover the ~420) → Phase 2.

---

## 0. What D3 is, and the problem it solves

The investigation proved (findings-doc §0): **the system surfaces what it's asked, not what's true.** Every layer of every problem this session was found by operator questioning — never by a check, never by unprompted disclosure. The verification layer confirms it *answered the question*, not that it *surfaced everything relevant*, and is structurally worst at detecting **absence** (excluded data, missing sources, unasked questions).

D3 makes verification surface depth **without being asked**, so operator suspicion becomes the *escalation* path, not the *only detection* path. Three capabilities + one hard proof constraint:
- **(a)** assert outcomes, not proxies
- **(b)** state its own blind spots
- **(c)** probe for absence/exclusion, not just verify presence
- **Proven only by bootstrapping against this session's KNOWN failures** — D3 cannot be verified by the regime it replaces.

A requirement is **implemented IFF it re-detects its specific session failure.** "We wrote code for (c)" ≠ "(c) works." (c) works iff it would have surfaced the 420.

---

## 1. The three requirements, each tied to the failure it must re-detect

### (a) Assert outcomes, not proxies → re-detects criterion-6, the 401, the dry-run
**Defect:** checks validate a proxy (ran / 200 / loaded / no-error / absent) and infer success; proxy true, outcome false.
**Mechanism — Component A helper library** (`scripts/lib/verify.mjs`), extracted from the two checks that already do this right (`apply-114.mjs` reads the function result back; `verify-end-to-end.mjs` mints a fresh token before asserting):
- `assertReadBack(label, readFn, expected)` — fresh re-query of persisted state; refuses the mutation's own return value.
- `fetchOk(url, init)` — non-2xx → throws; absence after non-200 is **INCONCLUSIVE**, a distinct verdict from PASS.
- `observeFired(probeFn)` — asserts a gate's *effect* (blocked/prompted), not "loaded."
- `prodPath(name)` — returns the canonical impl; grep-rule bans raw source-`fetch()` in `*-verify*`/`*-dryrun*`/`apply-*`.
**HOW IT'S GENERAL:** each asserts a *category* — "stored ≠ returned," "non-2xx → inconclusive," "effect-not-presence," "must-call-canonical." The three failures are **instances** that trip a category, not three hardcoded checks.
**Re-detects:** criterion-6 → `assertReadBack` (stored status ≠ verified despite the 200); 401 → `fetchOk` (non-200 → inconclusive, cannot print FLIPPED); dry-run → `prodPath` (raw fetch ≠ canonical).

### (b) State its own blind spots → re-detects the cron + build-runners
**Defect:** the audit reported findings as complete; it didn't enumerate worker/cron/build-runner paths and didn't SAY so. What it missed was worse than what it found.
**Mechanism:** a **surface registry** (the exhaustive list of surface *classes* logic can live in — routes / workers / crons[`vercel.json`+`.github/workflows`] / build-seed-runners / migrations-SQL / edge-instrumentation / test-fixtures / lib-helpers) + a mandatory **coverage block** every audit emits: `{method, walked[], not_walked[], cannot_see[], assumptions_unverified[]}`. An audit with no coverage block is rejected as incomplete.
**HOW IT'S GENERAL:** the audit *iterates the registry* and reports per-class walked/not-walked — it does not "look for the cron," it enumerates ALL surface classes, so any un-walked class is visible as `not_walked`. The cron/build-runner misses become impossible: covered, or declared uncovered.
**Re-detects:** a content-fetch audit's coverage block must list `workers`, `crons`, `build-runners` as walked → surfaces `check-sources`, `tier1-population-runner`, `canonical-source-discover`; or declare them not_walked (still visible).

### (c) Probe for absence/exclusion → re-detects the 420  *(THE hard one)*
**Defect:** no check that verifies what IS catches what's MISSING. The ~420 wrongly-excluded sources were invisible to every registry audit because rejected candidates aren't IN the registry.
**Mechanism — two registries** (this is what makes (c) general, not 420-specific):
- **Exclusion-surface registry:** every surface that records what was kept OUT — `source_verifications` (rejects), `quarantined`, `staged_updates`, `sources.status='inaccessible'`, …
- **Unreliable-method registry:** methods proven untrustworthy — plain UA-less fetch, the dead jq hook, …

D3 audits each exclusion surface and **flags rows whose exclusion method ∈ the unreliable-method registry.**
**HOW IT'S GENERAL:** it does not "look for the 420" — it cross-products (exclusion surfaces) × (unreliable methods). The 420 **falls out** because `source_verifications` is a registered exclusion surface and reachability-via-plain-fetch is a registered unreliable method. It would equally catch a *future* exclusion surface excluded by a *future* unreliable method, with no new code — only registry entries.
**Re-detects:** D3 independently arrives at "420 candidates rejected on reachability via a now-unreliable fetch → likely real sources wrongly excluded," WITHOUT being told to look. **If D3 would not surface the 420, (c) is decorative and D3 is not done.**

---

## 2. Drift-check (intent-vs-code) → re-detects Browserless drift; proxy.ts UNCONFIRMABLE
`verifiable_at:` anchor on each decision-log row (`path#symbol` + predicate + `expect:`) → `scripts/decision-drift-check.mjs` → **IMPLEMENTED / DRIFTED / UNCONFIRMABLE**. DRIFTED + UNCONFIRMABLE both surface to `integrity_flags (category=decision_drift)`; **UNCONFIRMABLE is LOUD, never silent-pass** (inconclusive ≠ pass, applied to the checker itself).
**The predicate must assert BEHAVIOR, not text** (refinement: the drift-check is otherwise a proxy *recursing into the checker*). "The call site resolves to the canonical fetch fn" (behavior/AST), NOT "`browserlessRender` appears" — the latter would have **false-IMPLEMENTED off the stale `browserless.ts` header comment that named deleted callers** (a real this-session example). A predicate that can only grep-match is **lower-confidence → UNCONFIRMABLE, not IMPLEMENTED.**
**Re-detects:** the all-Browserless decision → DRIFTED for the period a `fetch(` remained on the scrape/classification/build paths; `proxy.ts` runtime-pickup → UNCONFIRMABLE (demonstrating loud-inconclusive).

---

## 3. D3 invocation — runs WITHOUT being asked, + self-liveness  *(load-bearing)*
Invoke-only D3 has the original disease at the meta-level (surfaces only when asked). D3 must run **unprompted**:
- **CI gate** on every PR + a **periodic full sweep** (e.g. daily/weekly).
- Results to **`integrity_flags`** (a durable queue), NOT a console someone must read.
- **Self-liveness check** (`observeFired`-style: "did D3 actually run within its window?") — because **there is no `.github/workflows` and the harness hook was proven inert**, so D3's automated trigger is *unbuilt infrastructure*. If the trigger silently dies, D3 stops and we get a **green badge implying coverage that's gone** — the deepest version of the disease. D3's own liveness must therefore be verified, not assumed.

---

## 4. The two acceptance tests — D3 not done until BOTH pass

### Acceptance Test 1 — re-catch the KNOWN failures (bootstrap)
D3, run against this session's manually-found failures (ground truth independent of the broken regime), must re-detect **every one**:

| # | Known failure | General check it falls out of |
|---|---|---|
| 1 | fail-open hook ("loaded"≠fires) | (a) `observeFired` + drift UNCONFIRMABLE (harness, not code-confirmable) |
| 2 | criterion-6 revert (200, state unchanged) | (a) `assertReadBack` category |
| 3 | 401 false-positive (non-200 absence = pass) | (a) `fetchOk` category |
| 4 | dry-run wrong-path (non-prod fetch) | (a) `prodPath` category |
| 5 | ~10 fetch drifts (incl. build-runners, inline dup) | (b) surface enumeration + §2 drift |
| 6 | cron near-miss (HEAD bot-block → trust-degrade) | (b) surface registry includes workers/crons |
| 7 | build-runner defect | (b) surface registry includes build-runners |
| 8 | ~420 reachability-exclusions | (c) exclusion-surface × unreliable-method |
| (+) | all-Browserless decision drift | §2 drift-check DRIFTED |

**Pass:** all re-detected. **Miss any → not done.**
**ANTI-GAMING:** you must NOT pass Test 1 by hardcoding the 8 signatures — that's an automated replay of the manual investigation, blind to anything novel. Re-catching the 8 must **fall out of the general category checks** above. **Fixtures test the CATEGORY, not the fixed bug** — e.g. case #2 uses a synthetic "mutation returns success but read-back differs" row, NOT the now-fixed criterion-6 path, so it proves `assertReadBack` works as a category.

### Acceptance Test 2 — Block-1 re-audit (THE real test) + bounded-confidence exit
Run D3's general checks against Block 1 (gate schema, validate fn, trigger, criterion-6 fix, tick flow, 1.14, 1.15, read gate). By this session's statistics, Block 1 — verified by the broken regime with ad-hoc operator catches — **likely contains ≥1 thing the current verification missed.**
**Verdict rules:**
- D3 finds ≥1 real unknown → **D3 is working** (surfacing the unasked — the actual disease).
- **Clean → SUSPECT, not reassuring** (everything clean this session was hiding something). Exit is bounded, NOT open-ended: clean is accepted ONLY if a **diverse injected-defect panel — one per requirement class: a proxy-pass, an un-enumerated surface, an exclusion-by-unreliable-method, a behavioral drift — is ALL caught**, AND accepted **with the named residual** that novel-shape absence stays uncovered. The verdict is *"clean to D3's probe depth; novel absence still uncovered,"* never *"clean."*
**Why Test 2 is the one that matters:** Test 1 can be gamed by signature-matching; finding an *unknown* cannot. Test 2 proves D3 probes rather than pattern-matches. (Honest: the inject-panel proves *category* depth, not all-shapes — acceptance is bounded confidence, not certainty.)

---

## 5. D3's integrity depends on these STAYING MAINTAINED  *(the consolidated maintenance set)*

D3 is accumulating standing-maintenance dependencies. **The blind spot re-opens precisely where one of these silently lapses** — so they are named here as a set, not scattered as per-component caveats. D3's own coverage block must report the freshness of each:

| Dependency | How the gap re-opens if it lapses |
|---|---|
| **Surface registry** kept current | a new surface type (new runtime/route class) added without registering → that class becomes `not_walked`-invisible again (the cron/build-runner class of miss) |
| **Exclusion-surface registry** kept current | a new exclusion/rejection store not registered → its wrongly-excluded rows go un-audited (a new 420) |
| **Unreliable-method registry** kept current | a method later proven unreliable, not registered → exclusions it caused aren't flagged |
| **Drift predicates kept BEHAVIORAL** | a predicate left as text/grep → false-IMPLEMENTED off a stale comment (the `browserlessRender`-off-deleted-callers case) |
| **D3's own liveness verified** | the trigger silently dies → D3 stops running, green badge over zero coverage (the deepest trap) |
| **Living regression set grows** | a new manual catch not appended as a category check + fixture → that shape can recur unflagged |

**The gap re-opens at: unregistered-surface / unregistered-exclusion-store / unregistered-unreliable-method / stale-text-predicate / silently-dead-D3 / un-appended-new-shape.** Maintenance of this set is itself a standing discipline D3 must surface (it reports its own registry/liveness freshness in every run's coverage block).

---

## 6. The honest limit
Even bootstrapped, D3 catches the **shapes a probe exists for.** The class the operator is best at finding — genuinely novel, absence-shaped, the unasked question — is the hardest to pre-write a check for, because you can't enumerate what no one has thought to look for. So: D3 will catch known shapes and still miss novel absence-shapes; it **reduces** how much rests on operator suspicion, it does not eliminate it. This is NOT a reason to delay D3 — it's a reason to build it AND keep "probe for absence / ask the unasked" as ongoing operator discipline, and to keep the regression set living + extensible.

---

## 7. Build order + branch discipline
On approval: build Component A → §2 drift-check → (b) surface registry + coverage block → (c) two registries → §3 invocation + self-liveness → build Test-1 suite (general fixtures) → run to 10/10 → Test 2 (Block-1 re-audit, bounded exit). Only then is D3 trustworthy; the canonical fetch fix is built next and verified by it.
D3 is real code → **its own branch** (`sprint4/d3-verification`), file-scoped commits, reviewed like Block 1. (`sprint4/fetch-canonicalization` with the dropped plain-first edit stays parked; D3 is separate and first.)
