# Date-Integrity & Duplicate Audit — Caro's Ledge (2026-07-07)

> Live-DB audit run against production (`kwrsbpiseruzbfwjpvsp`) on 2026-07-07, triggered by the
> Claude-Chrome runtime finding that PPWR showed four different application dates. Two class
> problems were confirmed corpus-wide, not as isolated instances. Read alongside
> [DEEP-AUDIT-2026-07-07.md](DEEP-AUDIT-2026-07-07.md) and [MASTER-PLAN.md](MASTER-PLAN.md); the
> remediation packages are `p3-timeline-extractor`, `p6-date-backfill`, `p6-dedup`, and the standing
> guard `p5-dup-and-date-audits` in `.claude/workflows/caros-ledge-remediation.js`.

Method: read-only SQL + 6 parallel agents reading full-brief prose and diffing it against stored
`item_timelines`. Scope: the 109 **verified** regulation-family items (`regulation, directive,
standard, guidance, framework`) with a real brief (>500 chars). The finding generalizes to the rest
of the corpus — this scope was chosen because timelines matter most for regulations.

---

## 1. Timeline integrity — SYSTEMIC FAILURE

**Of 89 verified regulation briefs that carry legally-material dates, exactly 1 has a correct,
complete structured timeline.** (UK SAF Mandate, `a4`.) The other 88 are broken.

| Verdict | Count | Meaning |
|---|---:|---|
| `ok` | **1** | timeline present, complete, agrees with prose |
| `conflict` | **4** (+1 soft) | timeline present but a stored date **contradicts the law** |
| `missing_dates` | **9** | timeline present but **drops** material dates (often the nearest deadline) |
| `no_timeline_but_has_dates` | **75** | brief has material dates; **timeline completely empty** |
| `no_material_dates` | **20** | legitimately date-free (advisory/institutional/aspirational) |
| **Total audited** | **109** | |

Two faces of one defect:
- **~85% of verified regulations have NO structured timeline at all** despite the brief containing
  the dates — many briefs even contain a fully-written "Confirmed Regulatory Timeline" *table in
  the prose* that was never persisted to `item_timelines`. The model reads the document and builds
  the timeline; the structured-extraction step never harvests it.
- **The few timelines that exist are mostly wrong** — 4 of the ~16 populated timelines contradict
  the source law; most of the rest drop the nearest-term binding deadline.

### 1a. Confirmed CONFLICTS (stored date contradicts the law — customer acts on wrong date)

| Ref | Item | Prose (correct) | Stored milestone (wrong) | Note |
|---|---|---|---|---|
| `g2` | **EU PPWR 2025/40** | applies **12 Aug 2026** (Art. 71, quoted ~8×) | "Applies" = **2026-08-01** | 11 days early on the date customers act on. (UI additionally showed Jul 31 — a *separate* display bug.) In-force also drifts: prose 11 Feb 2025 vs milestone 2025-02-01. |
| `c1` | **CSRD** | Omnibus I only reached *political agreement* 9 Dec 2025 | "Omnibus adopted" = 2026-02-01 | Milestone asserts an adoption that had not happened. |
| `g34` | **CountEmissions EU** | TRAN 2nd-reading vote occurred 17 Mar 2026 | "Parliament vote expected" = 2026-01-01 | Labels a completed vote as future/expected. |
| `c2` | **EU Taxonomy** | transport criteria apply from Jan 2022 | "Transport criteria" = 2025-01-01 | Stored 2025 date unsupported by prose. |
| `g1` | EU Fit for 55 (soft) | earliest adoption 10 May 2023 | "Laws adopted" = 2023-01-01 | Summary milestone predates any actual adoption. |

### 1b. Worst DROPPED schedules (rich multi-year phase-ins, timeline empty)

- **EU Battery Regulation 2023/1542** — 11 phase-in dates 2023–2036, all missing.
- **Brazil PNCA** — annual SAF schedule 1%→10% across 2027–2037, all missing.
- **EU HDV CO2 (2024/1610)** — 15%/45%/65%/90% targets 2024–2040, all missing.
- **EU ETS maritime (2023/959)** — 40%/70%/100% surrender deadlines, all missing.
- **IMO CII / MEPC 338(76)** — Z-factor phase-in 2023–2030, all missing.
- **NYC Local Law 97** — penalty-accrual + compliance-period dates, all missing.
- **California AB 1305** — effective 1 Jan 2024 cited repeatedly, timeline empty.
- **EU heavy-truck CO2 (`l1`)** — has a timeline but **drops the −15% 2025 target**, i.e. the
  nearest binding obligation, while keeping the distant ones.

### Root cause & fix

The full document IS delivered to the model (correct, per doctrine — do not add scoping). The
extraction *contract* never demands date-completeness, and there is no validation that prose dates
reach the timeline. Fix at the source (`p3-timeline-extractor`): every date in the source becomes a
milestone or is explicitly classified non-material; a material prose date with no milestone is a
**validation failure**; milestone dates must agree with prose; never render "confirmed in primary
sources" for a derived/partial set. Existing rows heal via `p6-date-backfill` (audit → targeted
`refresh=true` regeneration). Standing nightly guard: `p5-dup-and-date-audits` (date-completeness lane).

---

## 2. Duplicates — CONFIRMED corpus-wide (6 groups)

The cross-reference/intersection machinery only ever *relates* items; nothing owns the "is this the
same thing?" question — so duplicates accumulated freely. The CSRD pair shares an **identical
source URL** and nothing caught it.

| # | Same law/entity | Keep | Archive | Disposition |
|---|---|---|---|---|
| 1 | **EU PPWR / Reg 2025/40** | `efdb3390` (g2) — 74 claims, 4 milestones, xref, UI slug | `5cc10a6d` — 44 claims, 0 milestones | Clear. Adopt 5cc10a6d's canonical ELI URL onto g2. (g2's milestones are the wrong-date ones from §1a.) |
| 2 | **CSRD** (same CELEX URL) | `f0833999` — 56K brief, 14 secs, 31 claims | `9c5d1d17` — **empty brief (0 chars)** | Clear — one is a hollow shell. Both quarantined. |
| 3 | **Reuters Sustainability** | `4de1e28e` — 23 claims | `d136c88c` — 10 claims | Clear (keep richer). |
| 4 | **Euro Clean Trucking Alliance** | `58bf0406` — longer brief | `29132ca6` — 26 vs 23 claims | Low-risk; port the 3 extra claims first. |
| 5 | **AFIR / Reg 2023/1804** | `62ba40b0` (correct title) | `6b0939a5` **mislabeled** "Sustainability Reporting" | ⚠ CONFIRMED mislabel — the brief text itself says 2023/1804 is AFIR, not sustainability reporting. Likely same law; **confirm before merge**. Feeds `p6-reclassification`. |
| 6 | **Singapore Green Finance Incentive** | — | — | ⚠ Same scheme name, **two different official sources** (`mpa.gov.sg` MPA vs `mas.gov.sg` MAS). May be two legitimate facets — **needs review**, do not blind-merge. |

Four clean auto-archives (1–4), two needing human adjudication (5–6). `p6-dedup` produces this
disposition list for authorization before any write. Root cause fixed by `p2-scan-materialize`
(mint-gate error-swallow + the unpaginated 1000-row dedup cap); standing guard added as the
duplicate-instrument lane in `p5-dup-and-date-audits`.

---

## 3. Bonus data-quality flags surfaced during the pass (→ `p6-reclassification`)

- `6b0939a5` titled "EU Regulation 2023/1804 - Sustainability Reporting" — is actually AFIR.
- `355af9e8` titled "Digital Markets" — brief is actually COM(2023)441 GHG accounting of transport.
- (From the Chrome audit) enforcement item filed as a market price signal; a contaminated-site
  remediation filed as an operations fact; government webpages surfaced as peer-reviewed research.

---

## Provenance of this audit

Read-only. No production data was mutated. 6 agents each read a deterministic slice of the verified
reg-family corpus (offsets 0/18/36/54/72/90) and diffed prose dates against `item_timelines`.
Duplicate metrics came from direct SQL (claim/section/milestone counts per row). Every remediation
that touches data is operator-gated in the workflow — nothing here has been executed.
