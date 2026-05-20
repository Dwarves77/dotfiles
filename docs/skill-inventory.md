# Skill Inventory

Catalog of every skill loadable in the Caro's Ledge Claude Code environment as of 2026-05-20.

Generated as the Part C deliverable of the 3-axis skill audit closure dispatch (parent commit `383974e` + 7th worked example bundle). Maintained per OBS-54 to prevent re-spelunking the file tree to know what's available.

**Source of truth.** For load triggers, the canonical source is each skill's YAML frontmatter `when_to_load:` block (custom skills only; plugin skills use their `description:` field). This document mirrors that data in human-scannable form.

## Source counts

| Source | Count | Status |
|---|---|---|
| Custom Caro's Ledge (`fsi-app/.claude/skills/`) | 5 | Active, load-bearing on every Caro's Ledge dispatch |
| Global user (`~/.claude/skills/`) | 1 | Active (frontend-design) |
| Superpowers plugin | 14 | Mixed: 7 load-bearing, 6 dormant by design, 1 always-on (using-superpowers) |
| Vercel plugin | 26 | Mostly dormant (off-stack: Caro's Ledge uses Next.js + Supabase, not Vercel deploy) |
| Expo plugin | 12 | Dormant (off-stack: no native mobile work) |
| React Native best practices plugin | 6 | Dormant (off-stack) |
| Built-in slash commands + utilities | ~10 | On-demand utility |
| **Total** | **~74** | |

## Section 1: Custom Caro's Ledge skills (load-bearing)

These 5 skills are the platform's discipline scaffolding. Located at `C:\Users\jason\dotfiles\fsi-app\.claude\skills\`. All carry self-describing `when_to_load:` frontmatter per the 3-axis audit class fix (commit `383974e`, 2026-05-20).

### caros-ledge-platform-intent

- **Purpose**: Canonical platform model. Five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community) plus cross-cutting capabilities (Map, Intelligence Assistant). Binds every dispatch to emit a Value Delivery Check section.
- **Load triggers**: any Caro's Ledge build sequencing, design, audit, or implementation dispatch; any dispatch touching the 5 customer-facing surfaces or cross-cutting capabilities; borderline cases default to load.
- **Status**: Active, load-bearing.

### sprint-followups-discipline

- **Purpose**: Loop-closure discipline + binding design-principle enforcement. Every design or implementation dispatch reads the current sprint's followups doc + `docs/design-principles.md` and emits an OBS coverage table + DP compliance section in its report. Hosts 10 named binding rules (Sweep-discipline, Source-credibility load-trigger, Remediation-discipline load-trigger, Batch-script resilience, Inference correction, Planning-doc, Sources-schema-touch, Dispatch-artifact commit-summary, Plan-skill hybrid, Verification-before-completion required).
- **Load triggers**: every Caro's Ledge design or implementation dispatch (any sprint, any phase); sprint planning or sequencing; skill-load reviews; borderline cases default to load.
- **Skip when**: investigation-only, hotfix scoped to one defect, research-only, conversation or status-check.
- **Status**: Active, load-bearing on every Caro's Ledge dispatch.

### source-credibility-model

- **Purpose**: Source credibility model. Six elements (type-based tier, bias tags, citation-network credibility, source discovery loop, operator override, recency decay), bias tag vocabulary, customer-facing signal sets per surface. Extends environmental-policy-and-innovation's 6-level Source Type Hierarchy.
- **Load triggers**: touches `sources` table; touches `source_citations` or `intelligence_item_citations`; modifies tier columns or bias_tag columns; touches the candidate review surface; modifies Haiku recommend-classification endpoints; modifies the verification pipeline; renders customer-facing credibility signals on the 7 surfaces; changes the discovery loop; modifies citation network scoring, recency decay, or override semantics.
- **Status**: Active, load-bearing for credibility-affecting work.

### environmental-policy-and-innovation

- **Purpose**: Freight sustainability intelligence system. 7 topic categories (emissions, fuels, transport, reporting, packaging, corridors, research), 8 jurisdictions, 4 impact dimensions, 5 brief format types, integrity rule (no invented facts, gap labeling, sourced cause-and-effect chains).
- **Load triggers**: touches intelligence_items, briefs, or any of the 5 brief format types; touches the 7 topic categories or 8 jurisdiction taxonomies; touches urgency scoring or format-section structures; generates customer-facing brief content; modifies the integrity rule enforcement; touches source classification (6-level Source Type Hierarchy); touches the source-category taxonomy.
- **Status**: Active, load-bearing for intelligence_items / brief work.

### remediation-discipline

- **Purpose**: Class-over-instance remediation discipline. 7 worked example categories (batch resilience, sweep methodology, type-system drift, API contract gaps, tool reliability, architectural codification, worktree cleanup discipline). Recognition criteria (4 signals + threshold rule) for class vs instance, primitive extraction patterns, discipline codification thresholds.
- **Load triggers**: framed as remediation, post-mortem, hotfix, or failure response; investigating a recurring pattern; extracting a primitive; adding a new binding rule to any discipline skill; scoping response to a bug, regression, or production incident.
- **Coordinates with**: sprint-followups-discipline (binding rules land there as named rules per Option A pattern).
- **Status**: Active, load-bearing for remediation and class-fix dispatches.

## Section 2: Superpowers plugin (mixed)

Located at `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/`. 14 skills.

### Always-on

| Skill | Purpose | Status |
|---|---|---|
| `using-superpowers` | Skill discovery and use protocol. Loads at session start. | Active, always loaded |
| `verification-before-completion` | Evidence before completion claims. Required regardless of dispatch size (per 10th binding rule in sprint-followups-discipline). | Active, universal load |

### Load-bearing (load when applicable)

| Skill | Purpose | Load when |
|---|---|---|
| `dispatching-parallel-agents` | One agent per independent problem domain, parallel concurrent execution. | 2+ independent failures or tasks |
| `using-git-worktrees` | Isolated workspace per feature via git worktree. Recognized paths: `.worktrees/`, `worktrees/`, `~/.config/superpowers/worktrees/`. | Starting feature work needing isolation |
| `subagent-driven-development` | Executing structured implementation plans with sub-agents. | Multi-step plan execution in same session |
| `writing-plans` + `executing-plans` | Plan-first discipline for multi-dispatch coordinations. | 3+ dispatch coordinations (per 9th binding rule in sprint-followups-discipline) |
| `finishing-a-development-branch` | Branch completion: merge, PR, cleanup. Step 6 auto-cleans worktrees under recognized paths. | Implementation complete, integration needed |

### Dormant by design

| Skill | Purpose | Why dormant |
|---|---|---|
| `brainstorming` | Pre-creative exploration of user intent and requirements. | Not currently in use; product direction is operator-led |
| `systematic-debugging` | Bug investigation protocol. | Caro's Ledge bugs typically remediation-shaped, handled by remediation-discipline |
| `test-driven-development` | Red-green-refactor discipline. | Codebase does not have a TDD harness; smoke-test discipline dominant |
| `receiving-code-review` + `requesting-code-review` | Code review protocols. | Single-operator project; no formal review tier |
| `writing-skills` | Skill authoring discipline. | Custom skills authored ad-hoc; this skill would tighten the loop if regular skill creation resumes |

## Section 3: Vercel plugin (mostly dormant, off-stack)

Located at `~/.claude/plugins/cache/claude-plugins-official/vercel/0.43.0/skills/` (and a duplicate 0.42.1 version per PLUGIN-NOTES.md). 26 skills.

**Caro's Ledge does not currently deploy to Vercel** (uses Supabase + custom hosting). All Vercel skills are dormant by default. Relevant ones if Vercel deploy is ever adopted:

| Skill | Purpose |
|---|---|
| `vercel-cli` | Vercel CLI guidance (env vars, deployments, projects, logs) |
| `vercel-functions` | Serverless + Edge Functions, Fluid Compute, Cron Jobs |
| `nextjs` | Next.js App Router guidance |
| `next-cache-components` | Next.js 16 cache components, PPR, `use cache` directive |
| `next-upgrade` | Next.js version upgrades + codemods |
| `next-forge` | next-forge monorepo SaaS starter |
| `ai-sdk` | Vercel AI SDK for AI features |
| `ai-gateway` | AI Gateway model routing |
| `shadcn` | shadcn/ui CLI + components |
| `auth` | Clerk, Descope, Auth0 integration |
| `vercel-storage` | Blob, Edge Config, Marketplace storage |
| `routing-middleware` | Request interception via middleware |
| `runtime-cache` | Per-region key-value cache |
| `workflow` | Workflow DevKit for durable workflows |
| `chat-sdk` | Multi-platform chat bot SDK |
| `vercel-firewall` | WAF, attack mode, rate limiting |
| `vercel-sandbox` | Firecracker microVMs for untrusted code |
| `vercel-agent` | AI-powered code review + incident investigation |
| `marketplace` | Marketplace integrations |
| `env-vars` | Environment variable management |
| `bootstrap` | Vercel-linked resource bootstrapping |
| `deployments-cicd` | Deploy + CI/CD |
| `turbopack` | Bundler config |
| `react-best-practices` | React TSX review checklist |
| `verification` | End-to-end browser → API → data verification |
| `knowledge-update` | Outdated-knowledge correction (auto-loaded at session start) |

## Section 4: Expo plugin (dormant, off-stack)

Located at `~/.claude/plugins/cache/expo-plugins/` across three plugin packages (`expo-app-design/1.0.0`, `expo-deployment/1.0.0`, `upgrading-expo/1.0.0`); each carries identical copies of the 12 skills. See `fsi-app/.claude/PLUGIN-NOTES.md` for the duplication caveat.

**Caro's Ledge has no native mobile work.** All Expo skills are dormant.

| Skill | Purpose |
|---|---|
| `building-native-ui` | Expo Router fundamentals: routing, styling, components |
| `native-data-fetching` | fetch, React Query, SWR, Expo Router loaders |
| `expo-api-routes` | API routes with EAS Hosting |
| `expo-cicd-workflows` | EAS workflow YAML for CI/CD |
| `expo-deployment` | iOS App Store, Play Store, web hosting deploy |
| `expo-dev-client` | Build and distribute dev clients via TestFlight |
| `expo-module` | Native modules via Expo Modules API |
| `expo-tailwind-setup` | Tailwind v4 + react-native-css + NativeWind v5 |
| `expo-ui-jetpack-compose` | Android-specific Compose UI |
| `expo-ui-swift-ui` | iOS-specific SwiftUI |
| `upgrading-expo` | Expo SDK version upgrades |
| `use-dom` | DOM components running web code on native via webview |

## Section 5: React Native best practices plugin (dormant, off-stack)

Located at `~/.claude/plugins/cache/.../react-native-best-practices/...`. 6 skills.

**Dormant.** Useful if React Native ever enters the stack.

| Skill | Purpose |
|---|---|
| `react-native-best-practices` | Performance optimization (FPS, TTI, bundle size, Hermes, FlashList) |
| `react-native-brownfield-migration` | Incremental adoption from native iOS/Android |
| `upgrading-react-native` | RN version upgrades via rn-diff-purge |
| `github` | gh CLI for PRs, stacked PRs, code review |
| `github-actions` | RN iOS simulator + Android emulator cloud builds |
| `validate-skills` | Skill validation utility |

## Section 6: Global + built-in utility skills

### Global user skills (`~/.claude/skills/`)

| Skill | Purpose | Status |
|---|---|---|
| `frontend-design` | UI work guidance per Apple HIG: React, Next.js, React Native, Tailwind, shadcn/ui. | Active for any UI dispatch (also loaded by sprint-followups-discipline for frontend dispatches) |

### Built-in slash commands and utility skills

Available system-wide. Most are on-demand operator tools.

| Skill | Purpose |
|---|---|
| `init` | Initialize a new CLAUDE.md file with codebase documentation |
| `start` | Review CLAUDE.md and produce session start summary |
| `status` | Project health check |
| `done` | Update CLAUDE.md with progress + next steps (per global preferences `/done` rule) |
| `review` | Review a pull request |
| `security-review` | Security review of pending changes on current branch |
| `security` | Run a security audit on the codebase |
| `update-config` | Configure Claude Code via settings.json (permissions, hooks, env vars) |
| `keybindings-help` | Customize keyboard shortcuts |
| `simplify` | Review changed code for reuse, quality, efficiency |
| `fewer-permission-prompts` | Scan transcripts for common tool calls, add allowlist |
| `loop` | Run a prompt or slash command on recurring interval |
| `schedule` | Create scheduled remote agents (cron jobs for Claude Code) |
| `claude-api` | Build, debug, optimize Claude API / Anthropic SDK apps |

## Maintenance

### When adding a new custom skill

1. Author the skill at `fsi-app/.claude/skills/<skill-name>/SKILL.md` with YAML frontmatter including `name:`, `description:`, and `when_to_load:`.
2. Add it to Section 1 of this document.
3. If it should auto-load on dispatch, add a load-trigger rule to sprint-followups-discipline (per Section 6 of remediation-discipline).
4. Sync to remediation-discipline-wt (and any future worktree) per the 3-step worktree-cleanup discipline.

### When deprecating a skill

1. Move the skill directory to `fsi-app/.claude/skills/_archived/<skill-name>-<date>/`.
2. Update Section 1 of this document.
3. Remove any load-trigger rules from sprint-followups-discipline.
4. Surface as an OBS entry if the deprecation has cross-dispatch implications.

### When updating skill content

1. Edit on master first.
2. Sync to active worktrees: `git -C <worktree> checkout master -- fsi-app/.claude/skills/<skill-name>`
3. If new triggers are added, update Section 1 of this document.
4. Commit with `Loop-closure: ...` line per the 8th binding rule in sprint-followups-discipline.

## Source files

- Custom skill files: `fsi-app/.claude/skills/<skill-name>/SKILL.md` (each)
- Plugin skill files: `~/.claude/plugins/cache/<plugin-source>/<plugin-version>/skills/<skill-name>/SKILL.md`
- Plugin duplication notes: `fsi-app/.claude/PLUGIN-NOTES.md`
- Sprint followups (OBS entries): `docs/sprint-N/followups.md`
- Design principles (DP entries): `docs/design-principles.md`
- Standing dispatch-inventory rule: `fsi-app/.claude/CLAUDE.md` ("Standing dispatch-inventory rule" section)
