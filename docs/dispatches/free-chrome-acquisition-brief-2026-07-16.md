# Dispatch — Free primary-source acquisition + $0 re-attribution (Caro's Ledge held-item drain)

**For:** a Claude Code agent running with **Chrome / browser access**, in the `Dwarves77/dotfiles` repo.
**Date:** 2026-07-16. **Owner project:** Caro's Ledge (`fsi-app/`). **Supabase:** `kwrsbpiseruzbfwjpvsp` (dev/prod shared — writes hit production; use the guarded path).

---

## 1. What you are doing and why

30 regulatory items are **quarantined** on `fact_below_authority_floor`: their FACT claims are grounded to sub-floor sources (news, analysts, corroborators) because **the real primary regulation text was never fetched or held**. Your job:

> For each item, **find and fetch the actual enacted primary source via Chrome (free)**, store it, and let the deterministic **$0 re-attribution** re-home each fact's span to that primary. **No paid grounding.**

**Why this way (do not deviate):** re-running the paid grounding pipeline (`groundBrief`) re-extracts the whole ledger with a Sonnet call — it costs the same as scrapping and regenerating the data, which is exactly what we are NOT doing. The data already exists; only the *authoritative attribution* is missing. Acquiring the primary (free, your Chrome) + re-attributing a verbatim span to it (deterministic, $0) is the whole fix. Target spend for this entire dispatch: **$0.**

The non-destructive grounding foundation just merged (PR #340): existing claims are **never** overwritten. Re-attribution **updates** a claim's `source_id`/tier in place; it never deletes. Preserve that.

---

## 2. Hard rules — integrity, never violated

1. **No paid grounding.** Do NOT call `groundBrief`, `generateBrief`, or any Sonnet/Browserless path. Do NOT set `GROUNDING_ACQUIRE_ENABLED` (it stays OFF — it is the paid-acquire safety gate). The only pipeline script you run is `free-pass-run.mjs` (NO fetch, NO model).
2. **Verbatim span match ONLY.** A fact re-homes to the primary **only if its exact stored span is verbatim-present in the fetched primary text.** A span that is not in the primary is NOT re-homed — it stays honestly held, or is relabeled/GAP'd. **Never stamp a fact to a source it is not in — a forced floor stamp is fabricated certification, the cardinal sin here.**
3. **The real primary, not a portal.** The item's `source_url` is often a landing/index/homepage (e.g. Oregon → `oregon.gov/deq/Pages/index.aspx`). You must navigate/search to the **actual enacted instrument text** (the specific rule / regulation / directive / standard) and confirm the spans are in it.
4. **Original-language verbatim is fine.** For a non-English national instrument, the span may be in the original language — match it verbatim and label "translated from [language]". **Never substitute an EU parent act (or any parent framework) as the primary for a national/sub-national instrument.**
5. **Full document, no silent truncation.** Fetch the complete enacted text. If a document is too large to capture in one pass, capture all of it across passes — do not silently keep only the first slice. If you can only get a partial page, say so.
6. **Error-body clean.** A bot-wall / 403 / 404 / login / cookie-consent / nav-shell page is NOT the primary. Never store it as a snapshot.
7. **Guarded writes only (rule 015).** All DB writes go through `scripts/lib/db.mjs` (`registerSource`, `guardedUpdate`) with a `cite`. Never raw `.update()/.insert()/.delete()`.
8. **Per-item read-back.** After re-attribution, read the item's `provenance_status` back and report the actual outcome. Never claim a flip you didn't verify.
9. **No fabrication anywhere.** If the real primary cannot be found or fetched for free, LEAVE the item held and record the honest reason (`NO_SOURCE_FOUND` = searched, nothing fetchable; `NO_SOURCE_QUALIFIED` = found N, span not present in any). Do not pay to force it; surface it for the operator.

---

## 3. The exact mechanism

**Run location:** `fsi-app/`. Scripts load env from `.env.local` (has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Node + jiti already wired in the existing scripts.

**Key building blocks (already in the repo):**
- `scripts/lib/db.mjs` → `registerSource({ url, name, base_tier }, { cite })`, `guardedUpdate(table, qbFn, patch, { cite })`.
- `src/lib/sources/snapshot-store.mjs` → `writeSnapshot(svc, sourceId, { html, status })` stores content as a floor-eligible snapshot in the `raw_fetches` bucket; `getSnapshot(svc, { sourceId })` reads it back.
- `scripts/_reground/free-pass-run.mjs` → the **$0 re-attribution runner**. `--apply` to write; `--only=<key>` to scope to one item. DRY-RUN default. It assembles each item's held captures from `item.source_id` + every `source_id` its claims already reference, reads each source's snapshot, and re-homes any failing FACT span that is **verbatim-present** in a floor-qualifying capture.

**Per-item procedure:**
1. **Read the failing spans.** `section_claim_provenance` where `intelligence_item_id = <id>` and `claim_kind='FACT'` and (`source_tier_at_grounding IS NULL` OR `> floor`). These exact strings are what must be found in the primary. (`scripts/tmp/free-pass-dryrun.json` also lists each item's `unmatchedSpans` sample.)
2. **Find the real primary (Chrome).** Start at `source_url`; navigate/search to the actual enacted text. Confirm the failing spans appear verbatim. Capture the full text (the readable content, not chrome/nav).
3. **Register the primary source** at its honest institutional tier (source-credibility-model): **legal text → base_tier 1** (EUR-Lex/OJ, legislation.gov.uk, Federal Register/eCFR), **regulator / gov / ministry / IMO / ICAO / Commission → 2**, **intergov analysis (OECD/IEA/World Bank/ISSB) → 3**, **standards body / class society (ISO, GLEC/SFC, LEED/USGBC) → 4**. Use `registerSource({ url: <primary URL>, name: <institution>, base_tier: <tier> }, { cite: { skill: 'source-credibility-model', reason: '...' } })`. It host-dedups + is idempotent; it returns `{ source_id }`. (For codified gov/legal hosts `free-pass-run.mjs` will also auto-register via SC-13, but registering explicitly with the honest tier is cleaner for non-codified hosts.)
4. **Store the fetched text as a snapshot:** `writeSnapshot(svc, source_id, { html: <full primary text>, status: 200 })`.
5. **Make the primary a candidate capture for the item.** `free-pass` only reads snapshots for sources the item's `source_id` or its claims reference. Since this primary IS the item's true primary (its `source_url` was a portal to it), point the item at it via the guarded path — and this simultaneously fixes the portal-source defect:
   `guardedUpdate('intelligence_items', qb => qb.eq('id', <id>), { source_id: <primary source_id>, source_url: <primary URL> }, { cite: { skill: 'remediation-discipline', reason: 'portal-source correction: repoint item to its real enacted primary so its held snapshot is a floor capture for $0 re-attribution' } })`.
   (Only change `source_url` if it was a portal/index, not the real instrument; if `source_url` already was the real primary, just ensure `source_id` points at the registered source.)
6. **Re-attribute at $0:** `node scripts/_reground/free-pass-run.mjs --apply --only=<key>`. It re-homes every verbatim-matched failing span to the primary snapshot at its floor tier, touches the item, and reads back the flip.
7. **Verify + record.** Confirm `provenance_status='verified'`. If it re-homed but stayed quarantined, report which criterion still fails (other than floor). If some spans didn't match the primary, report them as honest residual (relabel/GAP candidates — never forced).

**PROVE ON ONE ITEM FIRST.** Run the full procedure end-to-end on a single item (suggest `fabda0e7` Oregon DEQ — 23 spans, or a smaller one like `0ea6a710` NY DOT — 1 span), confirm the **$0 flip** and the exact working recipe (especially step 5's wiring), report it, and only then batch the remaining items. If step 5's assumption needs adjustment, you find it on item 1, not item 30.

---

## 4. Worklist — 30 residual items

`key | failing spans | source_url (often a PORTAL — find the real instrument)`

```
0ea6a710 | 1  | https://dot.ny.gov/divisions/operating/osss/truck/regulations
0f46aabf | 8  | https://gov.si/drzavni-organi/ministrstva/ministrstvo-za-okolje-podnebje  (Slovenia MOP — non-EN)
o9       | 19 | https://sdir.no/en/legislation/circulars/adoption-of-zero-emission-requi  (Norway Sjøfartsdir)
c5       | 50 | https://smart-freight-centre-media.s3.amazonaws.com/documents/GLEC_FRAME  (GLEC Framework, SFC — tier 4)
c8       | 32 | https://ifrs.org/groups/international-sustainability-standards-board  (ISSB — tier 3)
china... | 20 | https://mee.gov.cn/xxgk2018/xxgk/xxgk15/202312/t20231215_1060234.html  (MEE — non-EN)
g15      | 25 | https://mintransporte.gov.co/publicaciones/10754/transporte-sostenible  (Colombia — non-EN)
japan-gx-league | 26 | https://meti.go.jp/press/2023/10/20231027004.html  (METI — non-EN)
45f85547 | 23 | https://apps.leg.wa.gov/wac  (Washington Admin Code)
55f90df0 | 4  | https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResol  (IMO resolution)
576554b3 | 17 | https://assets.publishing.service.gov.uk/government/uploads/system/uploa  (UK gov PDF)
c4       | 5  | https://iso.org/standard/78864.html  (ISO 14083 — tier 4; standards paywall, find the official abstract/text)
82f09535 | 5  | https://sdir.no/en/news/zero-emission-requirement-for-the-world-heritage  (Norway)
87ed781c | 3  | https://wisdotplans.gov/plan/state-freight-plan  (Wisconsin DOT)
g13      | 25 | https://gov.br/mma/pt-br/assuntos/.../logistica-revers  (Brazil MMA — non-EN, Latin-1)
uk-secr  | 16 | https://gov.uk/guidance/streamlined-energy-and-carbon-reporting
japan-top-runner | 30 | https://meti.go.jp/policy/energy_environment/energy_efficiency/transport  (METI — non-EN)
green-building-leed | 16 | https://support.usgbc.org/hc/en-us/articles/12089652865683-Applying-LEED  (USGBC — tier 4)
uae-hydrogen-transport | 9 | https://uae.gov.ae/en/about-the-uae/strategies-initiatives-and-awards/fe  (UAE)
b6b7eb7d | 20 | https://mlit.go.jp/sogoseisaku/transport/content/001578180.pdf  (Japan MLIT PDF — non-EN)
india-nlp | 16 | https://commerce.gov.in/trade/national-logistics-policy-carbon-standards  (India — note: commerce.gov.in has bot-walled before)
bec305e1 | 4  | https://federalregister.gov/documents/2024/04/22/2024-06809/greenhouse-g  (Federal Register — tier 1, real primary)
bfb6a9fe | 9  | https://imo.org/en/ourwork/environment/pages/air-pollution.aspx  (IMO — find the MARPOL/MEPC resolution)
uae-hydrogen-decree | 14 | https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/federal-
la-eweo  | 3  | https://codelibrary.amlegal.com/codes/los_angeles/latest/lamc/0-0-0-2937  (LA municipal code — tier 1/2)
uae-netzero-roadmap | 16 | https://moccae.gov.ae/en/media-centre/news/uae-net-zero-transport-roadma
nashville | 12 | https://nashville.gov/departments/general-services/news/metro-government
eu-csrd  | 20 | https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464  (EUR-Lex — tier 1, real primary)
japan-gx-freight | 26 | https://meti.go.jp/english/policy/energy_environment/global_warming/gx-f  (METI — EN available)
fabda0e7 | 23 | https://oregon.gov/deq/Pages/index.aspx  (Oregon DEQ Clean Fuels Program — find the OAR rule text)
```

The exact `unmatchedSpans` per item are in `fsi-app/scripts/tmp/free-pass-dryrun.json` (regenerate with `node scripts/_reground/free-pass-run.mjs --limit=60`, DRY-RUN, $0).

**Notes:** several are non-English (match original-language spans, label as translated). Some are true tier-1 primaries already named (`bec305e1` Federal Register, `eu-csrd` EUR-Lex) — those should be quick. `c4`/`c5`/`c8` are tier-3/4 standards bodies (ISO/GLEC/ISSB) — the floor for those item types may already be met by a tier-4 source; check the item's floor before assuming re-attribution is needed. `india-nlp` (commerce.gov.in) and other JS/bot-walled hosts are where Chrome earns its keep — if genuinely unfetchable, record `NO_SOURCE_FOUND` and move on.

---

## 5. Reporting

Per item: the real primary URL you found, spans matched (N of M), the outcome (`VERIFIED-FREE` / `REHOMED-STILL-QUARANTINED:<reason>` / `HELD:<NO_SOURCE_FOUND|NO_SOURCE_QUALIFIED>`), and spend (should be `$0`). Summary: counts of each outcome + total spend (target `$0`). Flag any item where you had to make a judgment call on primary identity for operator review.

**Do NOT:** run paid grounding, set `GROUNDING_ACQUIRE_ENABLED`, fabricate a floor stamp, store an error/portal page as a primary, delete or overwrite existing claims, or substitute a parent framework for a national instrument.
