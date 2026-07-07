# Systemic end-to-end audit — fetch/compute without use (2026-06-28)

READ-ONLY. Settled rule applied (no judgment hedging): **any fetch OR compute whose result is not USED —
discarded, written where nothing reads, partially used, or silently errored — is BROKEN.** Trace every
"supposed-to-act" mechanism front-to-back; the front half running is not "working."

## THE VERDICT: systemic verification gap, not isolated bad luck
The four breaks found one-at-a-time tonight (q7, B#2, convergence, check-sources) are the SAME shape, and
the systemic trace finds more of it. **Roughly half of the automated/compute mechanisms that are supposed
to act are broken-but-running**, and the single most important mechanism that is supposed to EXIST — an
automated content-freshness loop — **does not exist at all.** The breakage is silent by construction: a job
that fires into a void throws no error, so nothing caught it. The missing build-time check is "does this
output reach a consumer and do its job," end to end.

---

## 1. THE BIGGEST FINDING — there is NO working content-freshness loop (corpus is manual-only)
Confirmed end-to-end. Nothing automatically detects changed source content and re-grounds the affected briefs.
- `check-sources` writes `monitoring_queue.change_detected` = **hardcoded `false`** (check-sources/route.ts:78). Nothing ever sets it true.
- `monitoring_queue` is **write-only in practice**: its only reader is `/api/worker/reconcile`, which filters `change_detected=true` (never true) AND is **wired to no schedule** (not in any workflow).
- `drain-first-fetch` is **onboarding only** — it first-fetches NEW sources; it never re-fetches existing source content.
- `/api/admin/scan` → `staged_updates` requires **manual operator approval** to apply; no auto-apply, no scan cron.
- There is **no cron that re-generates or re-grounds briefs** (vercel.json has only q7; the GHA workflows are monitoring/CI).
- `agent_runs` last 7d = 0; the only refresh path is operator-initiated `/api/agent/run`.

**This is the same problem as the staleness fought all session.** The freshness mechanism (check-sources) never
worked — it renders pages and discards the body, and its change signal is hardcoded off. Stale pools / old
content / sub-floor grounding are downstream of *having no freshness loop*. The corpus has only ever been as
current as manual regeneration made it.

---

## 2. SCHEDULED JOBS — WORKS vs BROKEN (the "supposed-to-act" set)
| Job | Trigger | End-to-end verdict |
|---|---|---|
| `q7-daily-recompute` | Vercel nightly | **BROKEN** — computes a tier, writes the wrong column (`tier`→shim→base_tier), never `effective_tier`; 0 tier changes ever. Fires into a void nightly. |
| `check-sources` | GHA hourly *(now disabled)* | **BROKEN** — Browserless-renders each source, uses only `.status`, **discards the body**; `change_detected` hardcoded false. Fetch-without-use (the template). |
| `drain-first-fetch` | GHA hourly *(now disabled)* | **BROKEN** — onboarding works, but it fetches the source body, extracts Haiku metadata, then **discards the body** (no persist; `/api/agent/run` re-fetches the same source). Also: no global-pause gate. |
| `spot-check/recurring` | GHA monthly *(now disabled)* | **BROKEN** — reachability render discards body; the content it does fetch is Haiku-classified and the result is **logged but never applied** to the source (report-only). |
| `trust-recompute` | GHA monthly | **WORKS** — computes `trust_score_*`, written + **read** at supabase-server.ts:226-229 (credibility) + SortRow. *(Corrects an earlier "write-only" claim — it has live readers.)* |
| `data-audit-lane` | GHA nightly | **WORKS** — audits → opens the `DATA_AUDIT_BLOCK` row → generation preflight HALTS on it (generate-brief.ts:385-389). Teeth are real. |
| `discipline`, `bug-class-guard` | GHA on push | **WORKS** — CI gates. |

Scheduled tally: **3 work, 4 broken.**

---

## 3. FETCH PATHS under the settled rule (fetch-without-use = broken)
**BROKEN (result discarded / not applied):**
1. `check-sources` browserlessRender — renders, uses `.status`, discards body.
2. `spot-check` `checkReachability` browserlessRender — renders, uses `.status`, discards body.
3. `spot-check` `fetchContent`→Haiku — classifies the content but the verdict is **report-only**, never applied.
4–6. `drain-first-fetch` `apiFetch` / `rssFetch` / `browserlessRender` — fetch body → extract metadata → **discard body** (re-fetched downstream by agent/run).

**WIRED (result used):** generation grounding fetches (primary `fetchPrimaryDeep`, corroborators, `web_search`/
`discoverCorroborators` → synthesis → stored brief), `/api/admin/scan` web_search (→ staged_updates),
`fetch-now` (manual; content surfaced), verification/discovery (content → Haiku → `source_verifications` applied),
the Ask assistant read.

Fetch tally: **~6 broken, the rest wired.** All broken ones are the automated/worker paths; the operator-
initiated generation fetches are wired.

---

## 4. COMPUTE-AND-STRAND (work without use)
| Value | Verdict |
|---|---|
| q7 tier compute → `tier` not `effective_tier` | **BROKEN** (stranded; see §2) |
| B#2 citations: pipeline writes `sources_used[]`, citation-stats RPC reads the **never-written** `intelligence_item_citations` edge table | **BROKEN** (stats stale every brief) |
| `source_trust_events` (written by q7, check-sources, spot-check) | **STRANDED** — no code reads this table; pure write-only audit log |
| `theme_candidate` | **STRANDED** — write-only (only a docstring + the write + a console.warn; no reader). Deliberate Emergence-Capture residual, follow-on unbuilt. |
| `sources_used[]` | WIRED — read by `/api/intelligence-items/[id]/metadata` (separate from the broken citation-stats path) |
| `trust_score_*` | WIRED — read by supabase-server credibility + SortRow *(corrected)* |

---

## 5. ERROR-SWALLOW class (fetch/write runs, error dropped → result effectively discarded)
The documented "line-37 PostgREST-swallow" class recurs. Highest-stakes (on the live generation path, agent-
reported + spot-verified):
- **canonical-pipeline.ts:708** — `const { data } = await sb.from("sources").select(...).range(...)` drops `error`; on a page-read error it `break`s with an **incomplete resolver** → claims whose host sits in a missing page resolve to **NULL** → spurious NULL-stamps. **This is a direct contributor to the NULL-stamp / claims-tier drift.**
- **canonical-pipeline.ts:730** — claim `insert(...).select("id").single()` drops `error`; a failed claim insert is silent and the step still returns `ok:true`.
- **canonical-pipeline.ts:774** — brief-source registration read drops `error`; silent skip, function reports success.
- **source-growth.ts:95 / 168** — existing-source lookup + convergence reads drop `error` → duplicate source registration / credibility update silently skipped on any DB hiccup.
- **auth/permission routes** (`workspace/overrides`, `orgs/[org_id]/members`) — DB error becomes a false 404/403 (security-relevant).
- Intentional/OK: `pause.ts` (documented "assume not paused" safe default).

These are silent landmines; the canonical-pipeline ones plausibly contributed to the very drift the lane reports.

---

## HONEST SCOPE ASSESSMENT
- **Not 4 isolated breaks — a systemic build-quality/verification gap.** The same shape (front runs, back unwired,
  output unread → silent) appears across q7, check-sources, drain, spot-check, B#2, convergence, the freshness
  loop, monitoring_queue/reconcile, source_trust_events, theme_candidate, and several swallow sites. That breadth
  is the signature of "built to LOOK wired (it runs) without an end-to-end check that the output reaches a consumer."
- **The count:** of ~7 scheduled "supposed-to-act" jobs, **4 are broken**; ~6 fetch paths are fetch-without-use;
  ~4 compute outputs are stranded; ~5 dangerous error-swallows; and the **freshness loop doesn't exist.**
  Loosely: **about half** of the act-on-data mechanisms don't actually use their data.
- **Two corrections I owe** (integrity): `trust_score_*` is read (not write-only as I said earlier), and the scrape
  was metadata-only (prior turn). I down-weight agent line-numbers I didn't personally re-read (the swallow sites
  are agent-reported except 708/730 which I verified).
- **The connection is confirmed:** the staleness problem and the broken-monitoring problem are the same problem —
  there was never a working freshness loop, so the corpus drifted stale and every fix that assumed fresh content
  was working uphill.

Remediation is deferred. This is the scope map: **how much is broken-but-running.** The answer is "a lot, all the
same way," and the fix is structural — an end-to-end "output reaches a consumer" check, not N one-off patches.
