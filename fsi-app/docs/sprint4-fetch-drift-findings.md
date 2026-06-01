# Sprint 4 — Verification Blind-Spot & Fetch-Method Drift: Consolidated Findings

**Status:** CONFIRMED outcome of the 2026-05-31 read-only investigation (verification-blind-spot brief + registry-soundness probe). No fixes applied; this is the record. Directives D1/D2/D3 are the agreed remediation (see end).

---

## 0. META-FINDING — the actual lesson (bigger than any single bug)

**The system surfaces what it's asked, not what's true.** Across this entire investigation, EVERY layer of the real problem was found by operator questioning — never by a system check, never by unprompted disclosure:

- dry-run reported "fetch layer SOLID, ~28% flag" → operator asked why "12% dead in a young registry" made no sense → **Browserless gap surfaced**
- operator asked "aren't we using Browserless?" → **the plain-fetch-method defect**
- the code audit found 2 drifts → operator said "you're missing things" → **the monitoring cron** (the highest-impact drift, in an un-enumerated path)
- operator asked "what did the cron eclipse?" → **the build-runner defect**
- assistant concluded "tiers sound" → operator asked "should we audit the tiers?" → role→tier verified AND **the rejection log surfaced: ~420 wrongly-EXCLUDED high-authority candidates — the actual damage**

At every step the system reported clean/complete, and the next truth appeared ONLY because the operator distrusted the green report. **The verification layer confirms it ANSWERED THE QUESTION, not that it surfaced everything relevant — and it is structurally WORST at detecting ABSENCE (excluded data, missing sources, unasked questions). The system's integrity currently depends entirely on operator suspicion. That is not sustainable.**

### D3 gap (recorded honestly)
D3 as scoped (drift-detection + verification helper) checks recorded-decisions vs live code — the **intent-vs-code slice**. It would NOT have caught the rejection-log finding: that came from asking "what got EXCLUDED," and **no check that verifies what IS catches what is MISSING.** A complete fix needs checks that:
- **(a) assert OUTCOMES, not proxies** — read the end-state back / use the production code path (never trust "ran / 200 / loaded / absent").
- **(b) STATE THEIR OWN BLIND SPOTS** — the audit should have declared up front "I did not enumerate worker / cron / build-runner paths," so the un-walked surface is visible instead of silently absent.
- **(c) specifically PROBE FOR ABSENCE / EXCLUSION** — audit the rejection log / what was dropped, not just the admitted rows. Presence-verification cannot find missing things.

### Re-prioritization
This justifies **D3 + a broader "surface-the-unasked" discipline being FOUNDATIONAL** — plausibly mattering MORE than the fetch fix: the fetch fix solves one defect; (a)/(b)/(c) address *the reason the operator had to find it manually*. Build sequence unchanged for now, but D3's design now carries the (a)/(b)/(c) requirements as hard requirements.

---

## 1. The fetch-method defect — ONE broken pattern, ~10 sites

Every site below uses a **plain, UA-less (or bot-UA) `fetch()`** to acquire SOURCE content. Bot-protected real sources (EUR-Lex, Council of the EU, gov portals, IRENA) return 403/404/thin to exactly this request, while resolving fine via the canonical `browserlessRender`. So all of these silently mis-handle real, reachable sources.

| # | Site | Kind | Effect of the defect |
|---|---|---|---|
| 1 | `src/app/api/worker/check-sources/route.ts` L76 (plain HEAD + `CarosLedge-Monitor/1.0`) | **production cron** (NOT scheduled) | marks bot-blocked real sources `inaccessible`, resets trust. **Near-miss** (see §3). |
| 2 | `src/lib/sources/verification.ts` `fetchContent` L378 | **production** (W2.F candidate classification + discovery) | mis-classifies bot-blocked candidates → wrong tier / reject |
| 3 | `src/lib/sources/recommend-source-tier.ts` | production (Phase 1.5) — **now plain-first→Browserless-fallback** (uncommitted fix) | was plain-only; flagged real sources low-confidence |
| 4 | `src/app/api/admin/spot-check/recurring/route.ts` `fetchContent` L130 | production (recurring spot-check) | a SECOND divergent `fetchContent`; mis-spot-checks |
| 5 | `src/app/api/admin/sources/bulk-import/route.ts` L271 | production (import validation) | bot-block artifact on import |
| 6 | `supabase/seed/tier1-population-runner.mjs` L792/L841 | **build runner** | tiered/classified off the broken fetch; MECHANISM for build-time mis-tiering exists (L966 reachability→tier "L"). BUT measured: stored `base_tier` shows NO fetch-bias (bot-blocked-but-real sources at tier 1-2 at the same 67% rate as plain-fetchable; 90/107 high-auth already tier 1-2; 1 mis-tier candidate) — `base_tier` is role-derived (mig 063), immune to the content-fetch defect. Residual risk = *rejected* real sources (bot-blocked→not-admitted), not mis-tiered present ones. |
| 7 | `supabase/seed/canonical-source-discover.mjs` L102 | **build runner (discovery)** | discovery validated/admitted via broken fetch |
| 8 | `supabase/seed/california-pilot.mjs` L525/L582 | build runner | same |
| 9 | `scripts/wave1-api-discovery.mjs`, `scripts/audit-optionc-reachability.mjs` | scripts | same |
| 10 | `supabase/seed/generate-eu-missing-briefs.mjs` L451 | build runner | **INLINES a duplicate `browserlessRender`** (divergent copy of the shared helper) |

Canonical (correct) sites: `src/app/api/admin/sources/[id]/fetch-now/route.ts`, `src/app/api/worker/drain-first-fetch/route.ts` — both route via `browserlessRender` (access-method-aware). `browserlessRender` (`src/lib/sources/browserless.ts`) is the single-source-of-truth.

**D1 must replace ALL of the above with ONE canonical fetch function they all CALL** (not aligned copies) — including the cron and the discovery/build runners.

---

## 2. Discovery validates with a PROXY + the broken fetch

`src/lib/sources/discovery.ts` admits a source via:
- (a) the **model's `web_search` self-claim** — the system prompt L212 instructs "use web_search to verify each URL is reachable." This is a SOFT prompt instruction = a **proxy** ("the model says it checked" ≠ "the URL resolves"). Unenforced.
- (b) `validateCandidate` (L305) — only a **regex format check** on the URL, no fetch.
- (c) `verifyCandidate` (`verification.ts`) — the only real fetch, via the **broken plain `fetchContent`**.
- (d) on verification crash → **insert to `provisional_sources` with NO fetch at all** (L506).

So the registry was built on weakly-validated, model-constructed URLs (the EUR-Lex trailing-slash format is the tell — the model constructed `…/TXT?uri=CELEX:…` without the canonical trailing slash). **Not catastrophic — 0 fabricated, ~1.2% genuinely wrong — but the MECHANISM is unsound and keeps admitting weak URLs.** D1's canonical fetch must be the admission gate: actually fetch-and-confirm (via Browserless) before a source is admitted, not a model self-claim.

---

## 3. The check-sources cron: loaded gun that didn't fire

- **NOT scheduled** (no `.github/workflows`, not in `vercel.json` crons [only `q7-daily-recompute` is], no caller). Ran ~once/source manually (192 touched).
- **Damage: 0 evicted** (`status='inaccessible'` = 0). It only flips status on the 2nd consecutive failure; running ~once, it never reached the flip.
- **~49 sources trust-dinged** (`consecutive_accessible=0`, `last_inaccessible` set) — bot-block false-failures. Of those 49: **19 recoverable via Browserless, 19 passed plain GET (HEAD-only bot-block, definitely real), ~11 dead-candidates.** ~38/49 provably real and recoverable.
- **If it had ever been scheduled it would have run twice and evicted ~49 real authoritative sources.** → **FIX-BEFORE-SHIP: do not schedule check-sources until its fetch uses the canonical function.**
- `q7-daily-recompute` (the one scheduled cron) is **clean** — recomputes `effective_tier` from stored trust data, no URL fetch.

---

## 4. Registry true health (the real number)

| Metric | Value |
|---|---|
| Population (active sources + provisional A6.2) | 1,115 |
| Usable, plain fetch only | 808 (72.5%) |
| Usable, with Browserless fallback | **980 (87.9%)** |
| Residual (fail even via Browserless) | 135 (12.1%) |
| — of which **GENUINELY gone/wrong-URL** | **13 (1.2%)** |
| — of which real-but-hard-to-fetch (timeout 111 / JS-challenge 8 / 403-even-Browserless 3) | 122 |
| **Fabricated / invented sources** | **0** |

**The registry is sound (~99% real).** The "12% dead" headline was a fetch-method artifact. The true never-valid set is **13 sources** (real orgs, moved/wrong paths — mostly IRENA old site paths + a few gov roots) → a small **wrong-URL cleanup list**, not a corpus-integrity hole.

---

## 5. The verification blind-spot (proxy-not-outcome) — 6+ confirmed instances

(1) fail-open hook "loaded"≠fires; (2) tick 200 success≠persisted (criterion-6 revert); (3) AFTER "FLIPPED" was a 401-empty false-positive; (4) Phase-1.5 dry-run measured a non-production fetch path; (5) "fetch says working" / no-timeout; (6) discovery's "model says it verified the URL" self-claim. Reads, writes, and validation all affected. **D3 (drift-check + verification helper + UNCONFIRMABLE-must-be-loud) is justified and prioritized.**

---

## 6. Directives (agreed)
- **D1 — canonical fetch function:** ONE function all ~10 sites CALL. Default ALL-BROWSERLESS unless the re-measure proves plain-first saves real money (re-measure: 87.9% usable, so plain-first saves ~308 of 1,115 renders — cost decision pending Browserless $/render). Replace the cron + discovery/build runners too.
- **D2 — wire `verification.ts`:** committed; exact wiring follows D1's pattern.
- **D3 — drift-check + verification helper:** `verifiable_at:` anchors on decision-log rows + `decision-drift-check.mjs` → `integrity_flags`; helper (`assertReadBack`/`fetchOk`/prod-path-binding) extracted from `apply-114.mjs` + `verify-end-to-end.mjs`. **UNCONFIRMABLE surfaces loud, never silent-pass.**

## 7. Open / fix-before-ship
- check-sources: do NOT schedule until canonical fetch wired.
- `recommend-source-tier.ts` header comment over-claims "browserlessRender SSOT" while the body does plain-first — correct the comment when D1 lands.
- `proxy.ts` (Next 16 middleware rename): convention-correct, but **runtime pickup is UNCONFIRMABLE read-only** — needs a runtime check that middleware actually runs (an exemplar D3 case: rename-correct ≠ loaded).
- Block-4 reattach ledger: `docs/sprint4-block4-reattach-ledger.md` (source-pool / system-prompt / parse-output are KEEP-reserved, not dead).

## 8. RE-SEQUENCE + Block-1 asterisk (2026-05-31, operator ruling)

**D3 is now FIRST — before the canonical fetch fix.** Reason: a fix built before D3 would be verified by the *current* regime (the one that reported the fail-open hook fine, criterion-6 working, the 401 a pass, the dry-run solid) — i.e. unverifiable. D3 must exist first so everything after is checked by a layer that asserts outcomes.

**New sequence:** D3 (design → build → bootstrap-verify) → **re-audit Block 1 under D3** → canonical fetch fn (swap all ~10 sites) → narrowed Phase 1.5 (recover the ~420 reachability-rejections + the ITF re-tier) → Phase 2.

**BLOCK-1 ASTERISK:** Block 1 was verified by the current regime and merged (`a1ec31e`). **"Merged ≠ verified-to-standard."** The criterion-6 revert and the 401 false-positive were caught by ad-hoc operator vigilance, not by Block 1's checks; what was NOT thought to be checked is exactly what the current verification wouldn't surface. **Block 1's "verified" status carries the same asterisk as everything else until D3 re-audits it.** Everything built before D3 is suspect until re-checked.

**D3 BOOTSTRAP REQUIREMENT:** D3 is itself a build; if verified by the current regime we're back in the trap. The escape: D3 is trustworthy ONLY if, run against the failures already found MANUALLY this session, it re-catches **every one, 100%** (fail-open hook, criterion-6 revert, 401 false-positive, the ~10 fetch drifts, the cron near-miss, the 420 reachability-exclusions, the publisher error-swallow). Miss any → not done. D3's test suite is built FROM this session's findings.
