# Data Completeness & Truncation Audit — Caro's Ledge corpus (2026-07-06)

The audit you requested: is the captured/grounding data COMPLETE, not truncated? Scope: 2,097 real source
captures (>200 ch) across 355 items; 276→279 verified items; all `intelligence_item_sections`; all FACT claims.
Read-only investigation; every fix that followed is cross-referenced. **Bottom line: the historical size-cap
truncation was already fixed (PR #155); the real defect was the capture layer storing FAILED FETCHES as source
content, which produced a fabricate-via-error-page moat breach — now closed.**

---

## 1. Distribution evidence — NOT a corpus-wide size truncation
Pool captures are naturally distributed, not clustered at a cap (if sources were cut at 12 KB, the 992 rows in
2–12 KB would pile up exactly at 12000 — only 4 do):

| Pool source length | Rows |
|---|---|
| < 2 KB | 219 |
| 2–12 KB | 992 |
| 12–60 KB | 874 |
| 60–200 KB | 8 |
| > 200 KB | 4 |

Near-round-cap (truncated-at-cap signature): **7 rows**. Open truncation-guard flags: **2**. So classic
truncation is small; the historical "218/258 grounded against <12–16 KB slices" was cured by PR #155.

---

## 2. The four exposure categories

### Category 1 — truncated-at-cap: **7 items**
Captures at ~12 K (4), ~32 K (1), ~60 K (2) — lost their tail to an old cap. 5 verified, 2 quarantined.
**Disposition:** re-fetch full document at hold-lift (work order).

### Category 2 — LIVE silent grounding-input truncation: **17 items** → FIXED
`GROUND_SECTION_MAX_CHARS = 12000` silently sliced each brief SECTION before the grounder saw it — a binding
fact past 12 KB was invisible (false GAP / missed slot). 18 sections >12 K, largest 32,228 ch. 10 verified, 7
quarantined. **FIXED (PR #193):** sections now reach the grounder complete to a *surfaced* 200 K ceiling;
size-cap doctrine (F17/RD-12) REDs any new silent cap. **Proven in production:** 576554b3 flipped on re-ground
because its tail fact is now visible. 3 sole-failure-in-tail items (576554b3✓, 27dfbe4c, 03b5f234) were the
first re-queue candidates.

### Category 3 — short captures (200 ch – 2 KB): **206 captures, adjudicated by 3 agents**
| Class | Count | Meaning |
|---|---|---|
| **stub-junk** | **193 (94%)** | FAILED FETCHES stored as source: Cloudflare/Radware bot walls ("Just a moment"), 403/Access-Denied, **federalregister.gov / eCFR "Request Access" blocks (recurring heavily)**, 404s, EUR-Lex homepage-language-chooser portals |
| stub-fragment | 8 | real authoritative host, body behind nav/JS (ksrevisor, globalpetrolprices, latransportationplan, dieselnet, portwatch, customs.go.jp ×2, arpa-e) — re-fetch |
| legit-short | 5 | genuinely short-but-complete (jolt.eco, STAP About, IADB abstract, climatepolicydatabase, ESPO Green Guide) — no action |

**This — not size caps — is the data-collection defect on record.** The capture layer never refused an error
body; it stored it. That is the 193-junk mechanism.

### Category 3B — mid-band floor-qualifying-on-FACT: **259/992 (26%), but only 5 real suspects**
259 of the 992 mid-band rows carry a floor-qualifying FACT — a full quarter, flagged plainly — BUT 254 are
legitimately-sized **tier-2 regulator/agency** sources (not enacted full texts, so 2–12 KB is normal). Only **5**
are on enacted-instrument hosts where the 57–173 KB size-vs-class gap applies: 2 are 404 junk (the named
breaches below), 3 are fragment captures (SAF Order, EU Battery Reg, Energy-Efficiency Regs).

---

## 3. Blast radius — the moat breach (grounding a FACT to a failed fetch)
Using single-home `isErrorBody` over every FACT claim's grounding capture:
- **51+ FACT claims across 27 items — 23 VERIFIED (customer-visible).**
- `isErrorBody` is conservative and MISSED the two 2989-ch EUR-Lex 404s, so the true count was higher.
- **2 named breaches** (355af9e8, 6f1e6615): a **tier-1 (binding-law) FACT whose span was literally
  "Page Not Found The page you are looking for was moved or doesn't exist"** — grounded to a EUR-Lex 404.

---

## 4. Remediation outcomes (all guarded, byte-compare read-back)
| Fix | Result |
|---|---|
| **2 named breaches** | invalidated; both items REMAIN verified on real FACTs |
| **Corpus-wide error-body claims** | **49 FACT claims invalidated** across 25 items; **0 re-pointable** (spans are error/nav text = pure fabrication); **20 items remained verified** (junk FACT redundant), **2 verified dropped** honestly (595117e9, c28b567f), 3 already quarantined |
| **Read-side gate (RD-13)** | `partitionErrorBodies` — an error body never enters grounding input / floor pool / nomination |
| **Write-side gate + escalation ladder (RD-14)** | in flight (separate agent) — an error body is never STORED as source content; per-class transport ladder |
| **Junk-pool necessity gate** | paid re-ground of an item whose remaining failures need content behind failed fetches is REJECTED |
| **45 completeness-exposure flags** | emitted (guarded, idempotent); resolved for remained-verified items |

**Net: no verified item retains a FACT grounded to a failed fetch. The moat breach is closed.**

---

## 5. Dispositions → the re-fetch/re-ground work order (`refetch-work-order-2026-07-06.md`)
- **Re-GROUND cheap now** (no fetch): cat-2 (17) — content complete, was truncated. Validated (576554b3 flipped).
- **Re-FETCH at hold-lift**, grouped by strategy: (a) seek-more for dead EUR-Lex 404s, (b) transport-fallback/
  deprioritize for bot-walled (IEA/IATA/ADB/itf-oecd/ScienceDirect ≈16), (c) Browserless render for JS-shell
  (customs.go.jp/portwatch ≈4), (d) **API-not-HTML for federalregister.gov + eCFR** (official APIs).
- **2 open truncation-guard flags** (efdb3390, 51b2c91e): on the work order, chunked-fetch strategy, hold-lift.

## Supporting artifacts
- `scripts/_plans/completeness-audit.json` — per-item category data
- `docs/design/refetch-work-order-2026-07-06.md` — hold-lift work order (grouped by host strategy)
- `docs/design/cap-inventory-2026-07-06.md` — all 12 size caps classified
- `scripts/remediate-errorbody-judge.mjs` / `apply-errorbody-remediation.mjs` — the remediation (audit record)
- Fixes merged: #193 (cat-2 + size-cap), #194 (error-body + junk-pool gates), #195 (work order)
