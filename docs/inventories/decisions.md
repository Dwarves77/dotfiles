# Architectural Decision Records (ADR) Inventory

Catalog of architectural decisions recorded as ADR files at `docs/decisions/`. Each ADR records a point-in-time decision with explicit scope (file globs) that triggers the 13th binding rule's cross-reference requirement.

## Status

**Created 2026-05-20** (ADR System dispatch; Sprint Architecture Layer 3). Initial set: ADR-001 through ADR-009. ADR-010 added 2026-05-21 (post-push verification floor; Layer 5a reframing). Future ADRs land at decision time.

## Lifecycle

| Status | Meaning |
|---|---|
| `proposed` | Decision pending; operator approval required before transition to accepted; rule 013 does NOT enforce reference for proposed ADRs |
| `accepted` | Binding; rule 013 enforces ADR-Reference (or ADR-Override) for commits whose staged files match the scope |
| `deprecated` | No longer recommended for new work but not actively contradicted; historical commits may still reference; new work should not extend |
| `superseded` | Explicitly replaced by a newer ADR (linked via `supersedes` field on the new ADR); the old ADR remains for audit trail |

## Initial ADR set (Sprint Architecture Layer 3)

| ID | Title | Status | Scope summary |
|---|---|---|---|
| ADR-001 | Platform model (multi-tenant, 5 surfaces, 3 layers) | accepted | tenancy + supabase clients + (tenant) routes + canonical-sources |
| ADR-002 | Tier model (base_tier + effective_tier) | accepted | trust.ts, supabase-server.ts, sources/, source-pool, source type, sourceStore, migrations |
| ADR-003 | Server-centric dual-write for tier fields | accepted | src/components/, decide/promote route handlers, stores, hooks |
| ADR-004 | Auth pattern split (isPlatformAdmin vs WORKER_SECRET) | accepted | src/app/api/admin/, src/app/api/worker/, auth lib |
| ADR-005 | Discipline enforcement layered architecture (5 layers) | accepted | fsi-app/.discipline/, .claude/skills/, docs/decisions/, docs/inventories/, .github/workflows/discipline.yml |
| ADR-006 | Plan-skill hybrid discipline (3+ dispatch coordination threshold) | accepted | docs/plans/, sprint-followups-discipline SKILL.md |
| ADR-007 | Bias-tag auto-cutoff threshold per dimension (D1 Option B) | accepted | q4-bias-batch script + recommend-classification routes + migration 097 + migration 092 |
| ADR-008 | urgency_score default behavior for intelligence_items inserts | accepted | community/posts/promote, wave1-cold-start, src/lib/urgency.ts, scripts/lib/urgency.mjs; Option C-bias strict (PRIORITY/URGENCY_TIER → numeric mappings); 2026-05-21 |
| ADR-009 | ADR system architecture (meta) | accepted | docs/decisions/, adr-loader.mjs, 013-adr-cross-reference.mjs, dispatch/audit.mjs |
| ADR-010 | Post-push verification as discipline floor | accepted | fsi-app/.discipline/rules/015-post-push-verification.mjs (+test), docs/decisions/ADR-010-*.md; reframes ADR-005 Layer 5 into 5a (verification, lands) + 5b (dashboard, deferred); 2026-05-21 |

## ADR-008 resolution (closed 2026-05-21)

Operator selected Option C-bias (strict, no default). ADR-008 now status=accepted with explicit mapping decisions recorded. F4 stays strict; the two prior `// fitness-allow: F4` overrides have been removed. Shared mapping library lives at `fsi-app/src/lib/urgency.ts` (TS) + `fsi-app/scripts/lib/urgency.mjs` (MJS mirror). OBS-63 closed.

## How to add a new ADR

1. Author file at `docs/decisions/ADR-NNN-kebab-case-topic.md` (NNN = next 3-digit zero-padded number, kebab-case slug from title).
2. Include YAML frontmatter with required fields: id, title, status, date, scope, supersedes, related.
3. Include body sections per Nygard template: Context, Decision, Consequences, Alternatives Considered. References section optional.
4. Default status to `proposed` if pending operator approval; `accepted` if operator-confirmed during decision conversation.
5. Add row to the table above + bump the count in this inventory's status section.
6. Commit with `ADR-Reference: ADR-009` trailer (this ADR file itself intersects ADR-009's scope per the meta-architecture).

## How to supersede a prior ADR

1. Author a new ADR-NNN with the replacement decision.
2. Set `supersedes: ADR-NNN-old` on the new ADR's frontmatter.
3. Update old ADR's status to `superseded`.
4. Update old ADR's body with a postscript noting the supersession date + the new ADR id.
5. Update this inventory.

## Maintenance trigger

Per the 11th binding rule (Inventory-artifact emission): any commit that creates or status-changes an ADR MUST update this inventory + emit `Inventory-emission: docs/inventories/decisions.md ...` line.

## Source files

- ADR files: `docs/decisions/ADR-NNN-*.md`
- ADR loader: `fsi-app/.discipline/lib/adr-loader.mjs`
- 13th binding rule: `fsi-app/.discipline/rules/013-adr-cross-reference.mjs`
- Audit script extension: `fsi-app/.discipline/dispatch/audit.mjs` (ADR-Reference + ADR-Override aggregation)
- Skill documentation: `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md` (13th binding rule section)
