# Program Close-out — build-to-completion (2026-07-08)

The build-to-completion program is **DONE** by the dispatch's own definition. This is the capstone
record: the DONE checklist with evidence, the three deliverables, and the one decision table the
operator still owns (the escalated flags).

## Definition of Done — all 7 met

| Criterion | Status | Evidence |
|---|---|---|
| All templates live | ✅ | 11/11 rebuilt + mounted on master; T03 detail archetype live (`RegulationDetailSurface.tsx`, reused by T05 + Research detail). `redesign-completeness-2026-07-08.md`. |
| Phase-3 quality complete | ✅ | migs 158 (per-claim floor) + 159 (FTS) applied + verified; prompt-cache, timeline backfill (984), dedup, P3c grounding landed prior. |
| Dedup enacted | ✅ | `dedup-2026-07-07-enact.mjs` ran; **0** live+verified items share an `instrument_identifier`. |
| Admin flags dispositioned | ✅ | 51 → **0 open** (38 resolved: 28 reclassified-to-source + 5 re-routed + 5 prior; 18 `in_review` with recorded recommendations). |
| Migration 160 applied | ✅ | Applied delegated-with-proof; 56→0 pinned, customer read path unchanged, advisor lint 168→0, ledger row 160. PR #263. |
| Blind-CI audit cleared | ✅ | `blind-ci-window-audit-2026-07-08.md` (#259): 8 dark suites green isolated, 0 in-window regressions across 81 merges. |
| Every guard green under branch protection | ✅ | All merges CI-green + gated on the watch; branch protection (4 required checks, enforce_admins) is the backstop of record. |

## Census delta (this dispatch)

- Verified-live items: **251**, all on a surface — **no_surface = 0** (the "hidden item" class is closed at the data layer).
  Regulations 102 · Market Intel 67 · Operations 37 · Research 45 = 251.
- 28 institution/portal items reclassified-to-source (all-time reclassified: 250); 5 market signals re-routed to Market Intel.
- 56 app-owned functions search_path-pinned (mig 160).
- Spend by agent this dispatch: **$0 LLM** — all work was SQL (execute_sql), git, and file edits. No paid backfills; scrape hold held (zero fetches).

## Deliverable 1 — the one browser-verification checklist

`browser-verification-pending.md` — the single accumulating list for Jason's one end-of-program
browser session (Option B). Non-blocking; every feature merged on backend proof. Five items:
dismissed-drawer restore (#260), surface-routing (#261), the 28-item reclassify cleanup, NotesField
happy-path, and the T01–T11 visual pass.

## Deliverable 2 — the standing switches (footnote, not tasks)

> **Cadence/loop** — ready to flip on Jason's word, post-build; technical precondition satisfied.
> **Batch-1** — go-line ready; quote on request. **Budget** — number set on request ($50/mo
> recommended). None of the three is build work, a blocker, or an "awaiting" item; nothing in the
> build is gated on them. Represented once here + in `flip-readiness-2026-07-08.md`.

## Deliverable 3 — the operator's decision table (18 escalated flags, `in_review`)

These are the genuine ambiguities the dispatch said route to Jason. Each is triaged with a
recommendation recorded in `/admin` (`integrity_flags.resolution_note`). None is CRITICAL; all
LOW/MODERATE.

### A. technology vs research_finding (4) — type call affecting format/surface
| Item | Now | Recommendation |
|---|---|---|
| Hydrogen & Ammonia as Maritime Fuel | research_finding / **Technology Profile** fmt, d2 | Retype `technology` (format already matches; stays d2; resolves flag). |
| Marine Fuel Decarbonisation Pathways | research_finding / **Technology Profile** fmt, d2 | Same — retype `technology`. |
| Battery & Electric Vehicle Technology | research_finding / Research Summary fmt, d2 | Operator call: retype `technology` (→d2) OR move to Research (d7). Content is tech; format is research. |
| Autonomous & Connected Freight Technology | research_finding / Research Summary fmt, d2 | Same call. |

### B. off-vertical relevance (2) — not a routing question
| Item | Now | Recommendation |
|---|---|---|
| MDEQ Water Contact Advisories (beaches) | market_signal, d3 | Archive `off_domain` — beach bacterial advisories, not freight-sustainability. |
| RI Fish Passage / River Herring | market_signal, d3 | Archive `off_domain` — fish migration, not freight. |

### C. borderline institution-vs-document / type / dedup (12)
| Item | Now | Recommendation |
|---|---|---|
| Nashville Building Energy Programs | regulation / Reg Fact Doc, d3 | Clean domain fix → d1 (format-confirmed regulation). Marginal freight relevance. |
| Solar & Battery Storage for Warehouses | regional_data / Ops Profile, d2 | Domain → 3 (Operations, format-confirmed). Near-dup ↓. |
| Warehouse Solar & BESS ROI | research_finding / Research Summary, d6 | Domain → 7 (Research, format-confirmed). Near-dup ↑ — decide keep-both (diff framing) vs merge. |
| 48th ASEAN Summit Outcomes | regional_data / Ops Profile, d4 | Domain → 3 (Operations). Relates to ASEAN Plan ↓. |
| ASEAN Transport Strategic Plan 2016-25 | market_signal, d1 | Domain → 4 if kept; or consolidate with 48th ASEAN Summit. |
| Joint Office of Energy & Transportation EV | market_signal, d1 | Domain → 4 (specific NEVI/EV-infra programs, freight-relevant) OR reclassify (federal office). Lean → 4. |
| Port of Los Angeles Env Management | market_signal, d6 | Ports are freight-relevant; decide market_signal→4 vs regional_data→Operations vs reclassify (port authority). |
| ENERGY STAR Branding & Marketing Guide | guidance, d2 | Domain → 1 if kept as guidance; or archive off_domain (marketing/branding, marginal freight fit). |
| LADBS May 2026 Newsletter + notices | guidance, d3 | Reports a specific GPMS fee; domain → 1 if kept; newsletter = ongoing pub (reclassify?). Marginal fit. |
| NC DEQ Air Quality Division | research_finding, d1 | Agency division overview → reclassify-to-source, or research_finding → d7. Lean reclassify. |
| UNCTAD Transport Infrastructure Programme | research_finding, d1 | UNCTAD programme; reclassify (institution) — dedup with the reclassified UNCTAD programme (t4). |
| UNCTAD Six-Step Framework | market_signal, d7 | Specific methodology doc; keep market_signal→4 OR fold into UNCTAD source. Dedup with t4/319f785d. |

**If you want**, say the word and I'll enact any subset (the format-confirmed domain fixes in C are
one-line guarded updates; the off-vertical archives and the type retypes follow the same guarded path).

## Related
- [[browser-verification-pending]] · [[flip-readiness-2026-07-08]] · [[deletion-reclassification-log]]
- [[redesign-completeness-2026-07-08]] · [[blind-ci-window-audit-2026-07-08]] · [[ADR-011-ddl-authority-delegation]]
