## Post-slim engine state (2026-05-21)

The discipline engine was slim-refactored on 2026-05-21 (commit landing this dispatch). The named-binding-rules block that lived in earlier versions of this skill (Inference correction, Planning-doc, Sources-schema-touch precondition, Sweep-discipline, Source-credibility-model load-trigger, Remediation-discipline load-trigger, Batch-script resilience, Plan-skill hybrid, Verification-before-completion) was retired. Those rules prescribed commit-message trailers (`Loop-closure:`, `Skill-loaded:`, `Verification:`, `Plan-file:`, `Sweep-enumeration:`, `Inference-correction:`, `Planning-doc:`, `Schema-touch-precondition:`, `Batch-resilience:`, `Class-vs-instance:`) which the engine cannot mechanically verify against code. Per the operator's published 5e3ae41 revert rationale: ceremony rather than enforcement.

**What remains active:** the core loop-closure protocol (OBS coverage table + DP compliance section in the dispatch report) and the Inventory consistency rule.

**The remaining discipline-engine surface (post-slim) — POINTER, not a parallel list.**

Do NOT maintain a hand-copied table of rules/fitness/consistency checks here; it drifts from the engine. The **single source of truth is the invariant registry** `fsi-app/.discipline/governance/invariants.mjs` (the per-invariant map: every invariant is `enforcedBy` a resolving mechanism — `rule:NNN` / `fitness:FN` / `consistency:CN` / `audit:<path>` / `selftest:` / `migration:NNN` — or `exempt`-with-reason), gated by the meta-gate `invariant-coverage.mjs` (which CI runs, and which resolves enforcement files against the git-TRACKED set so an untracked enforcement file fails locally = real CI parity). The mechanisms it references live in `.discipline/manifest.mjs` (rules), `.discipline/fitness/manifest.mjs` (F-checks), `.discipline/consistency/manifest.mjs` (C-checks). The **pre-push hook** runs the CI-parity checks locally before push (untracked critical-surface gate, consistency runner, discipline+fitness tests + the meta-gate, tsc); per the standing rule, a push is not complete until the GitHub Actions run on that commit is green. To see what's enforced right now, read the registry — not this skill.

For reference only (the registry is authoritative; do NOT re-describe what each enforces here): Rule 012 (hardcoded user-home path), Rule 014 (inventory consistency), F2 (admin-routes-isPlatformAdmin), F6 (migrations numeric ordering), F8 (client-server tier boundary), F9 (build compiles), C3 (migrations.md reality), C4 (worktrees.md reality), and the pre-push hook.

**Behaviors no longer enforced mechanically** but preserved as recommended methodology in this skill body (Anti-Patterns section + worked examples):
- Sweep-first discipline (glob/schema query before verification) — methodology only
- Skill-load attestation for source-credibility / remediation-discipline — load the skills when the conditions apply; attestation trailer is no longer required
- Plan-skill hybrid (3+ dispatch coordination plan file) — author the plan when the coordination warrants it; no Plan-file trailer required
- Loop-closure / Verification trailers — write them when they add audit trail value; no longer engine-enforced

### Secrets-topology consistency (the credential-surface sibling, SF-11)

The inventory-consistency class extends to the CREDENTIAL surface: **a referenced credential must be a registered credential.** Every GitHub Actions secret a workflow references (`secrets.X` in `.github/workflows/*`) MUST be registered in the secrets registry (`.discipline/governance/secrets-registry.mjs` `WORKFLOW_SECRETS`), which is kept equal to the live GitHub store. An unregistered/invented workflow secret reference is a build failure — this is the mechanical form of `no-new-secrets-without-need` and `credential-surface-visibility` (doctrine register). The scar it kills: the R0.2 probe referenced `secrets.PROBE_SECRET`, a name that was never a real secret entry, so it resolved to empty and the probe died. Enforced by `secrets-reference-audit.mjs` (filesystem-pure, red-then-green tested, and called inside the meta-gate so an unregistered reference literally fails it). Secret VALUES never appear in the registry or docs — names + topology only.

**The 2 remaining C-checks**:
- C3 migrations.md reality (caught migration 067 untracked on 2026-05-21)
- C4 worktrees.md reality (caught remediation-discipline worktree orphan on 2026-05-21)

New C-checks land at `fsi-app/.discipline/consistency/checks/CN-name.mjs`; manifest registration in `fsi-app/.discipline/consistency/manifest.mjs`. Add only when a real bug class justifies the addition; the 8 removed C-checks (C1, C2, C5, C6, C7, C8, C9, C10) had zero catches in their 24-hour lifetime.

**Worked example.** A commit adding a new migration at `fsi-app/supabase/migrations/099_*.sql` triggers C3 if the file exists on disk but is not listed in `docs/inventories/migrations.md`, OR if the inventory lists a migration filename that does not exist on disk (the migration 067 case). Rule 014 invokes the runner; runner reports C3 drift; rule 014 fails with the C3 missing-claim or orphan-claim message. Operator either updates the inventory (fixes the drift; runner passes) OR adds `Consistency-Override: C3 (rationale: <text>; remediation-deadline: <date>)`.
