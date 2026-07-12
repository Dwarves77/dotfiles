# Dead-Code Audit — 04: Dependencies & Shipped-to-Production

Date: 2026-07-12
Scope: read-only. DELETE NOTHING.
Working dir: `C:\Users\jason\dotfiles\fsi-app`
Method: `package.json` (dependencies + devDependencies) cross-checked against import/require matches in `src/**`, `scripts/**`, `.discipline/**`, `supabase/**`.

---

## STEP 5 — Unused Dependencies

### INSTALLED BUT UNUSED (zero import matches in first-party code)

| Package | dep / devDep | Evidence |
|---|---|---|
| `gsap` | **dependency** | Grep for `gsap` (and `from "gsap"` / `gsap/...`) matches ONLY `package.json` + `package-lock.json`. No import in `src/`, `scripts/`, `.discipline/`, `supabase/`. (Doctrine CLAUDE.md says "GSAP available" — it is installed but never imported.) |
| `@gsap/react` | **dependency** | Grep for `@gsap/react` matches ONLY package files. Companion to the unused `gsap`; the `useGSAP` hook is never imported. |
| `@workflow/ai` | **dependency** | Grep for `@workflow/ai` and `workflow/ai` matches ONLY docs (`docs/sprint4-*.md`) + package files — never a code import. Confirmed NOT a transitive dependency of the `workflow` package (it is absent from `node_modules/workflow/package.json` dependencies), so nothing pulls it in indirectly either. |

### BORDERLINE — no direct import, but transitively required (do not treat as freely removable)

| Package | dep / devDep | Note |
|---|---|---|
| `@workflow/next` | dependency | No direct import in code. The only match in `src/` is a **comment** in `src/proxy.ts` ("Per @workflow/next docs..."). The real import in `next.config.ts` is the subpath `workflow/next` (resolves to the `workflow` package's own `dist/next.cjs`), NOT the scoped `@workflow/next`. HOWEVER `@workflow/next@4.0.6` IS a declared dependency of the `workflow` package, so it is a **redundant re-declaration** of a transitive dep, not truly orphaned. Removing it is low-value and mildly risky (version-pin coupling with `workflow`); recommend leaving unless doing a deliberate Workflow-DevKit dependency cleanup. |

### USED — keep (representative evidence)

Dependencies (runtime): `@anthropic-ai/sdk` (haiku-classify.ts + admin routes), `@supabase/ssr` (proxy.ts, supabase-browser/server clients), `@supabase/supabase-js` (250+ files), `leaflet` / `react-leaflet` / `react-leaflet-cluster` (`src/components/map/MapView.tsx`), `lucide-react` (source components), `react-markdown` + `remark-gfm` (IntelligenceBrief, SectorSynopsis), `clsx` + `tailwind-merge` (`src/lib/cn.ts`), `unpdf` (pdf-extract, canonical-pipeline), `workflow` (generate-brief.ts, span-check.ts, next.config.ts), `zustand` (stores), `next` / `react` / `react-dom` (framework).

- `@types/leaflet` (**dependency** — unusual placement for a `@types/*` pkg, but harmless): type support for `leaflet` in MapView. Indirect/type-only — keep.

devDependencies — all indirect/tooling, keep:
- `@next/bundle-analyzer` — `next.config.ts` + `scripts/measure-bundles.mjs`
- `@tailwindcss/postcss` — `postcss.config.mjs`
- `eslint-config-next` — `eslint.config.mjs`
- `pg` — used by ~154 scripts under `scripts/**` and `supabase/seed/**`
- `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `tailwindcss`, `typescript` — standard toolchain

---

## STEP 6 — Shipped-to-Production but Not Needed at Runtime

### Correctly OUTSIDE the runtime bundle (no action)

`scripts/**`, `supabase/migrations/**`, `supabase/seed/**`, `docs/**`, and `.discipline/**` are NOT part of the Next.js module graph — nothing under `src/app` imports them — so they are not traced into the Vercel serverless/runtime bundle. They are audit-trail / tooling / one-shot artifacts (per the "Code-vs-data state separation" doctrine, the writes scripts intentionally live in-repo as the forensic record). Correct as-is.

### CONCERNING — bundled non-runtime data under `src/**`

**`src/data/seed-resources.json` — 1,228,774 bytes (~1.2 MB), git-tracked, ships in the bundle to extract a single date string.**

- The file is imported at `src/data/seed-resources.ts:2` (`import rawResources from "./seed-resources.json"`), re-exported through the barrel `src/data/index.ts`.
- The ONLY consumer of that barrel is `src/lib/data.ts:111`: `const seed = await import("@/data")` inside `appDataSeedFallback()` (called at `data.ts:151` on the exception path).
- That fallback (SF-2 Phase 1, 2026-05-27) was deliberately gutted to an **empty-shape factory**: every array is returned empty (`resources: [] as typeof seed.resources`, etc.). The `typeof seed.x` usages are type-only (erased at compile). **The single runtime value actually consumed is `seed.AUDIT_DATE`** (the string `"2026-03-01"`).
- Because it is a dynamic `import("@/data")`, Webpack/Turbopack pulls the whole barrel — including the 1.2 MB JSON and the sibling seed files (`seed-changelog`, `seed-disputes`, `seed-xrefs`, `seed-supersessions`, `seed-archive`, `seed-subjurisdictions`) — into an async chunk that ships to production. ~1.25 MB of embedded data is deployed to read one hard-coded date.
- The sibling seed `.ts` files (`seed-changelog.ts`, `seed-disputes.ts`, `seed-xrefs.ts`, `seed-supersessions.ts`, `seed-archive.ts`, `seed-subjurisdictions.ts`) are referenced ONLY by `src/data/index.ts` — i.e., they reach the bundle solely through the same dead-ish fallback.
- Note: this is the deployed *build artifact*, separate from Next's 2 MB data-cache limit that `data.ts:85-91` already addresses (that comment is about the `sources` payload in `getAppData`, not this JSON). The seed JSON is a distinct build-embedded blob.
- Suggested remediation (NOT performed): replace the whole `import("@/data")` with a bare `const AUDIT_DATE = "2026-03-01"` constant (or move that lone constant out of the barrel), which would let the 1.25 MB `src/data` tree drop out of the bundle graph. Confirm no other consumer first.

### NOT shipped — local build artifacts only (gitignored)

`src/app/.well-known/workflow/v1/**` — the Workflow DevKit dev-server output. Contains `route.js`, `manifest.json`/`config.json`, **2 `route.js.debug.json`** files, and **254 `route.js.*.tmp`** files (~180 KB each ≈ tens of MB of local disk clutter). The directory carries a `.gitignore` whose content is `*`; `git check-ignore` confirms `route.js` and `manifest.json` are ignored and `git ls-files` returns 0 tracked files there. These are regenerated locally and do NOT ship to production (Vercel builds from git). No production impact; only a local-disk-hygiene note (the 254 stale `.tmp` files could be cleared).

### Colocated test files under `src/**` (hygiene note, not a shipped-runtime concern)

~46 `*.test.ts` / `*.test.mjs` / `*.npmtest.mjs` / `*.selftest.mjs` files live colocated inside `src/lib/**`, `src/workflows/**`, `src/__tests__/**`. Next.js bundles by module graph, and no app route/component imports these, so they are NOT traced into the serverless bundle. They are a source-tree organization choice, not deployed runtime code. No action required for bundle size; flagged only for completeness.

---

## Summary

- **INSTALLED-BUT-UNUSED deps:** `gsap` (dependency), `@gsap/react` (dependency), `@workflow/ai` (dependency). Borderline: `@workflow/next` (dependency — redundant transitive re-declaration, no direct import).
- **Concerning src/**-bundled non-runtime file:** `src/data/seed-resources.json` (~1.2 MB, git-tracked) plus its 6 sibling seed `.ts` files — the entire `src/data` tree (~1.25 MB) is bundled via a dynamic import whose only runtime use is one date constant.
- **scripts/ · supabase/ · docs/ · .discipline/:** correctly outside the Next runtime bundle (not in the module graph). `.well-known/workflow/v1/**` is gitignored local build output — not shipped.
