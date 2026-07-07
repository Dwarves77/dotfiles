# Integrity-flag triage procedure

How to run, read, and act on `triage-integrity-flags.mjs` — the read-only
classifier for `intelligence_items` rows that the integrity trigger from
migration `035_agent_integrity_flags.sql` has surfaced.

## Background

Migration 035 added a BEFORE INSERT/UPDATE trigger that scans
`full_brief` for canonical agent-emitted flag phrases (e.g. "unable to
verify", "should be there", "replace the source URL", "if X was
intended", "specific article, regulatory text…", "could not confirm").
On match, the trigger sets:

- `agent_integrity_flag = TRUE`
- `agent_integrity_phrase = '<the matched phrase>'`
- `agent_integrity_flagged_at = NOW()` (only on the FALSE→TRUE edge)

The trigger never resolves itself — `agent_integrity_resolved_at` is
left to the admin resolution flow. The triage script consumes the
unresolved set and produces an action plan that the orchestrator
executes manually.

## Running the script

From the `fsi-app/` directory:

```bash
node supabase/seed/triage-integrity-flags.mjs
```

Requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Service role is required
for full read coverage across RLS-protected `intelligence_items`.

The script is **strictly read-only** — it issues SELECTs only, never
UPDATE/INSERT.

## Output

Two artefacts are written to `docs/`:

| File | Purpose |
|---|---|
| `INTEGRITY-TRIAGE-PLAN.json` | Machine-readable plan; orchestrator parses this |
| `INTEGRITY-TRIAGE-REPORT.md` | Human-readable report with per-item table + patterns |

## Issue types

Every flagged item is classified into exactly one of six types:

| Code | Label | Heuristic |
|---|---|---|
| (a) | source-url-broken | Phrase suggests a specific regulatory text was expected, but `source_url` host is non-canonical (wikipedia/news/aggregator) or not on the canonical-regulator allowlist |
| (b) | factual-gap | Verification-class phrase ("unable to verify", "could not confirm") + canonical regulator host — URL is fine, brief has gap |
| (c) | missing-regulation | Brief mentions a SPECIFIC named regulation (CA SB/AB, US H.R./S., EU Directive/Regulation NNNN/NNN, EU named framework) that has no matching `intelligence_items` row |
| (d) | stale-info | Flag is older than 180 days AND brief mentions an older year, OR brief is shorter than 1500 chars (placeholder) |
| (e) | over-flag | Permissive phrase ("should be there", "if X was intended") appears in legitimate prose context, not as a self-flag |
| (f) | other | No heuristic matched conclusively — surface for human review |

Order of precedence: **e → a → c → b → d → f**. Over-flags are
suppressed first (we never escalate noise). Source-URL-broken comes
before missing-regulation because a broken URL invalidates anything
downstream.

## Recommended actions

| Action | When emitted | Auto-safe? |
|---|---|---|
| `clear_flag` | over-flag | yes — just unset the flag |
| `replace_url` | source-url-broken AND a canonical replacement URL was found inside the brief | yes — single field UPDATE |
| `manual_review` | source-url-broken but no replacement URL candidate found | no |
| `regenerate` | factual-gap or stale-info | yes — re-runs the brief generation agent |
| `insert_new_item` | missing-regulation | **no — never auto-execute**; spawns new platform content |
| `human_review` | other | no |

`auto_action_safe: true` items can be batch-executed by the
orchestrator without per-item confirmation. All `false` items require
explicit operator review.

## Missing-regulation regex sieve

The script runs five conservative patterns over each brief. Each
requires a recognisable prefix AND a numeric/distinguishing component
to avoid false positives:

| Pattern | Example match | Jurisdiction | Canonical host |
|---|---|---|---|
| `ca_sb_ab` | "California Senate Bill 253", "AB 1305" | US-CA | leginfo.legislature.ca.gov |
| `us_federal_bill` | "H.R. 1234", "S. 1234" | US | congress.gov |
| `eu_directive_regulation` | "Directive (EU) 2024/1234", "Regulation (EU) 2023/956" | EU | eur-lex.europa.eu |
| `eu_named_framework` | "CSRD", "CSDDD", "CBAM", "EU ETS", "ReFuelEU Aviation", "FuelEU Maritime" | EU | eur-lex.europa.eu |
| `us_state_hb_sb` | "HB 1234", "SB 1234" — only fires when a state name is also in the brief | resolved from state context | (none — orchestrator looks up) |

Before promoting a match to a missing-regulation candidate, the script
checks two indices for an existing item:

1. Normalised-title set across all `intelligence_items.title` values
2. Substring-match against the `legacy_id` set (so "ca-sb-253" catches
   "California Senate Bill 253" even if the title varies)

Only matches that survive both checks are emitted as candidates.

## Avoiding over-classification

Three discipline checks built into the script:

1. **Phrase + content signal both required.** Heuristics never fire
   on phrase alone. source-url-broken needs a non-canonical host;
   factual-gap needs a canonical host; missing-regulation needs an
   actual regex match in the brief.
2. **Over-flag detector runs first.** `should be there` and
   `if X was intended` go through `detectOverFlag()` which inspects
   surrounding tokens. If the phrase reads as descriptive prose
   ("an exemption notification should be there for items above 50kg"),
   it's reclassified as over-flag (`clear_flag`).
3. **Insert-new-item is never auto-safe.** Even when the regex
   matches and the title isn't in the index, the orchestrator must
   confirm before inserting.

## Orchestrator workflow

1. Run the triage script.
2. Read `docs/INTEGRITY-TRIAGE-REPORT.md` end-to-end.
3. For each `auto_action_safe: true` item, decide whether to apply in
   bulk or step through.
4. For each `auto_action_safe: false` item, surface to the operator
   with the rationale and `needs_human_review_because`.
5. After applying any action, set `agent_integrity_resolved_at = NOW()`
   and `agent_integrity_resolved_by = <admin uuid>` on the affected
   row. The trigger from migration 035 will not unset
   `agent_integrity_flag` until the next `full_brief` change, but the
   resolved timestamp removes the row from the unresolved index.

## Re-running

The script is idempotent. Re-running overwrites both artefacts. Items
that have been resolved in the meantime drop out of the result set
(the script filters `agent_integrity_resolved_at IS NULL`).
