# W2.B — Sub-national-aware Discovery Agent

Status: implemented 2026-05-03. Backend only — no UI in this work item.

## Overview

The discovery agent answers a single question: given a jurisdiction code,
what are the canonical regulatory publishers in that jurisdiction whose
content affects freight sustainability?

It runs from `POST /api/admin/sources/discover` (CLI / admin trigger),
calls Claude Sonnet 4.6 with the `web_search` tool, parses the agent's
strict-JSON output, and hands every candidate to the W2.F verification
pipeline (`src/lib/sources/verification.ts`). Verification classifies
each candidate into tier H (auto-approved → `sources`), tier M
(queued-provisional → `provisional_sources`), or tier L (rejected, audit
log only).

## Files

| Path | Role |
|------|------|
| `fsi-app/src/app/api/admin/sources/discover/route.ts` | Public API entry point. requireAuth + isPlatformAdmin. |
| `fsi-app/src/lib/sources/discovery.ts` | Pure helper module (`discoverForJurisdiction`). |
| `fsi-app/supabase/migrations/038a_discovery_provenance.sql` | Adds `provisional_sources.discovered_for_jurisdiction`. |

## Sonnet prompt (final form)

```
You are a regulatory source discovery agent for a freight-sustainability
intelligence platform. Given a jurisdiction code, identify the government
bodies, regulatory agencies, official gazettes, and standards bodies in
that jurisdiction that publish content affecting:

- Climate / carbon / emissions regulation
- Sustainable freight / transport / shipping policy
- Customs and trade rules with sustainability dimensions
- Energy / fuel mandates affecting transport
- Labor/safety/environmental rules affecting freight operations

CRITICAL: Tier reflects canonicalness, not jurisdictional level.
A US state agency that issues primary regulation (CARB, NYSDEC) is T2,
the same as the federal-level EPA. Do not under-rate sub-national
publishers when they are the canonical source.

Return STRICT JSON ONLY:
{
  "jurisdiction_label": "full human-readable jurisdiction name",
  "candidates": [
    {
      "name": "Agency/body full name",
      "url": "primary public-facing URL where regulations live",
      "type": "regulator|gazette|standards-body|industry-association|court|court-tracker|aggregator",
      "language": "ISO 639-1 code",
      "freight_relevance_score": 0-100,
      "rationale": "<=200 char justification"
    }
  ]
}

Rules:
- Up to 20 candidates per call (aim for 10-15 typical, 5-8 for sparse jurisdictions, 15-20 for deep mode).
- Include sub-agency portals when they are the canonical regulatory publisher (e.g., CARB instead of just ca.gov).
- Skip pure news aggregators unless explicitly requested.
- Use web_search to verify each URL is reachable and currently active.
- Score freight_relevance_score conservatively. 100 = pure freight regulator. 50 = some freight overlap. 30 = freight is a small fraction of their content.
- For sub-national jurisdictions (ISO 3166-2 codes), include both the sub-national agencies AND a pointer back to relevant national agencies. Do not duplicate national entries that the parent country discovery would already produce.
```

The system prompt is exported as `DISCOVERY_SYSTEM_PROMPT` from
`src/lib/sources/discovery.ts` and is the single source of truth.

## Depth-mode parameters

| Depth | maxCandidates | web_search max_uses | Typical wall time | Approx cost |
|-------|---------------|---------------------|-------------------|-------------|
| `shallow` | 5 | 2 | 8-15s | ~$0.05 |
| `normal` (default) | 12 | 5 | 20-35s | ~$0.10 |
| `deep` | 20 | 10 | 35-55s | ~$0.15 |

Each depth's prompt-side guidance is appended to the user message at call
time; the system prompt itself is depth-agnostic.

`maxDuration = 60` is set on the route. Deep mode with verification per
candidate (sequential; each candidate ~3s end-to-end) lands close to the
ceiling. Shallow runs comfortably finish in well under 30 seconds.

## API contract

### Request

```ts
type DiscoverRequest = {
  jurisdiction_iso: string;     // e.g. "US-CA", "DE", "EU", "JP-13"
  depth?: "shallow" | "normal" | "deep"; // default "normal"
  language?: string;            // override; defaults to "en" (English-only Phase C)
  dryRun?: boolean;             // discovery + verification preview, no DB writes
};
```

### Response

```ts
type DiscoverResponse = {
  jurisdiction_iso: string;
  jurisdiction_label: string;
  depth: DiscoveryDepth;
  dryRun: boolean;
  candidates: DiscoveryCandidate[];          // raw agent output (post-validation)
  candidate_outcomes: Array<{
    candidate: DiscoveryCandidate;
    action: "auto-approved" | "queued-provisional" | "rejected";
    tier: "H" | "M" | "L" | null;
    rejection_reason: string | null;
    ai_relevance_score: number | null;
    ai_freight_score: number | null;
    ai_trust_tier: "T1" | "T2" | "T3" | null;
    resulting_source_id: string | null;
    resulting_provisional_id: string | null;
    error: string | null;
  }>;
  applied: { auto_approved: number; queued_provisional: number; rejected: number };
  used_verification_pipeline: boolean;
};
```

### Error semantics

- 400 `invalid_jurisdiction` — fails `isIsoCode()` check.
- 400 invalid depth, missing `jurisdiction_iso`.
- 401 — missing/invalid auth.
- 403 — caller is not a platform admin.
- 429 — rate limit.
- 500 `missing_api_key` — `ANTHROPIC_API_KEY` not configured.
- 502 `sonnet_api_error` — upstream Anthropic error. Body includes
  `upstreamStatus` and `upstreamBody` for debugging.
- 502 `parse_error` — Sonnet returned text that could not be parsed
  through any of the 3 JSON-extraction tiers. Body includes
  `raw_assistant_text` so the operator can see what the model emitted.

## Verification integration

`src/lib/sources/verification.ts` was **present** at the time of
implementation (2026-05-03, master HEAD `fe283c3` includes migration 037
and the verification helper). The discovery module imports
`verifyCandidate` directly and calls it sequentially per candidate.

For each candidate:

1. Build a `VerificationCandidate` carrying `url`, `name`,
   `jurisdiction_iso: [code]`, `discoveredFor: code`.
2. Call `verifyCandidate(...)` with the same Supabase service-role client
   so we don't pay double for client construction.
3. Bucket the outcome by `verification.action`:
   - `auto-approved` → `applied.auto_approved++`
   - `queued-provisional` → `applied.queued_provisional++`
   - `rejected` → `applied.rejected++`

If the verification pipeline itself crashes on a candidate (caught
exception, not just an L-tier rejection), the discovery module falls
back to inserting the candidate directly into `provisional_sources`
with `status='pending_review'`, `discovered_via='worker_search'`,
`discovered_for_jurisdiction=<code>`. The audit log on
`source_verifications` is not written in that fallback path — the
fallback's reviewer notes carry the failure reason.

After action execution, the discovery module patches the resulting
`provisional_sources` row (when one was created) to set
`discovered_for_jurisdiction = <code>`. The verification helper itself
does not stamp this column because its `discoveredFor` field already
goes into the `source_verifications` audit log; we copy it onto the
queued provisional row so review surfaces can filter by originating
jurisdiction without joining through the audit log.

`sources` rows produced by tier-H auto-approval do **not** receive a
`discovered_for_jurisdiction` stamp — the `sources` table has no such
column. Provenance for auto-approved rows lives in
`source_verifications.verification_log` and the `notes` field on the
new sources row.

### Nothing TODO on the verification side

Because `verification.ts` is present, there is no
"write straight into provisional_sources" code path engaged in normal
operation. The fallback path (`verifyOrFallback` in `discovery.ts`) is
exercised only when the helper module raises — which under current
behaviour is rare (the helper has its own try/catch around every step).

## Cost estimate per call

| Tier of jurisdiction | Depth | Sonnet cost | Verification (Haiku) | Approx total |
|----------------------|-------|-------------|----------------------|--------------|
| Tier 1 (large, e.g. US, EU, CN, IN, JP) | shallow | ~$0.05 | 5 × ~$0.001 | ~$0.06 |
| Tier 1 | normal | ~$0.10 | 12 × ~$0.001 | ~$0.11 |
| Tier 1 | deep | ~$0.15 | 20 × ~$0.001 | ~$0.17 |
| Tier 2 (sparse, e.g. small ISO 3166-2, mid-size country) | shallow | ~$0.04 | 3 × ~$0.001 | ~$0.04 |
| Tier 2 | normal | ~$0.08 | 6-8 × ~$0.001 | ~$0.09 |
| Tier 2 | deep | ~$0.12 | 10-15 × ~$0.001 | ~$0.13 |

Implicit cost rate-limiting: 60 req/min/user → ~$9 max burn rate per
user per minute at deep. The per-user 60/min limiter does not need a
separate cost gate.

## Calibration plan: California pilot

The first end-to-end calibration run targets `US-CA`. California is a
strong pilot because it exercises:

1. **Sub-national-as-canonical** — CARB issues primary regulation (low
   carbon fuel standard, AB32 cap-and-trade). The agent must rank CARB
   T2 alongside the federal EPA, not below it. Verification should
   land CARB at tier H (matched by the `arb.ca.gov` pattern at
   confidence=high).
2. **Sub-national gazette** — California Code of Regulations / OAL
   notice file. Tier H candidate (`oal.ca.gov`, `dot.ca.gov`).
3. **Sub-agency depth** — `CalRecycle` (waste/extended producer),
   `CalEPA`, `CPUC` (energy infrastructure), `CalSTA` (transport).
   Deep mode should surface 3-5 of these; normal mode 1-2.
4. **Cross-jurisdictional pointer** — agent should reference EPA and
   federal EIA where they intersect freight regulation, but not
   duplicate them as primary California candidates.

Calibration acceptance criteria:

- Normal-mode run on `US-CA` returns ≥ 8 candidates.
- ≥ 6 candidates verify at tier H (auto-approved).
- 0 candidates auto-approve with a `*.example.com` or non-California
  hostname.
- `CARB` (`arb.ca.gov`) is in the auto-approved set with
  `ai_trust_tier='T2'` and `freight_relevance_score >= 70`.
- Total wall time < 45s.

If the pilot misses any criterion, the prompt is the first thing to
adjust — depth-mode caps and verification thresholds are calibration
constants and stay fixed until a second jurisdiction (likely `DE` or
`SG`) corroborates a pattern.

## Migration

- Filename: `038a_discovery_provenance.sql`
- Schema change: adds `provisional_sources.discovered_for_jurisdiction TEXT NULL` and a partial index on non-null values.
- The existing `provisional_sources.discovered_via` column (CHECK in migration 004) is **not** modified. The discovery agent uses `discovered_via='worker_search'` for now, the same value the AI scan route already uses. A future schema split (separate `discovery-agent` channel) would change the CHECK constraint, which is out of scope here.

### Why "038a" instead of "038"

The W2.A worktree may also reserve migration 038. The orchestrator
rule is: if both lands, one gets renamed to 039 at integration. Naming
this file `038a_discovery_provenance.sql` keeps the integration
mechanical — the orchestrator can sort lexicographically and keep both
in numeric order with a deterministic tie-break. If W2.A's 038 happens
to also add `discovered_for_jurisdiction` on `provisional_sources`,
this migration becomes a no-op via `ADD COLUMN IF NOT EXISTS`.

## Constraints reaffirmed

- No emojis anywhere in code or doc.
- No modifications to `AdminDashboard.tsx`, `Sidebar.tsx`, type files,
  `verification.ts`, `browserless.ts`, or migrations 033-037.
- The Sonnet call is invoked from the helper module via the same
  `fetch("https://api.anthropic.com/v1/messages", ...)` shape used by
  `/api/agent/run` and `/api/admin/scan`. No SDK dependency added.
- Discovery never edits the existing scan or agent prompts (those are
  governed by SKILL.md).
- JSON parse failure returns 502 with the raw assistant text in the
  error body, per the orchestrator contract.
