# Lane D2: the data duplicate census (read-only; the coordinator ran the SQL, you write the record)

Model: Haiku. Worktree /home/user/dotfiles/.worktrees/wt-d2, branch lane/d2-data-duplicate-census-2026-09-18, based on origin/master at worktree creation (run `git log -1 --format=%h` and record it). Read brief-common-cloud.md first (pasted above in your prompt). You have NO database access; every number below was measured by the coordinator on 2026-09-18 between 23:50 and 23:58 UTC with SELECT-only aggregates on the live Caro's Ledge Supabase project, and you copy them verbatim. Do not invent, round, or extend them.

## Why
Build plan section 6.7 (PR #718), row D2: "the data duplicate census: verified live items sharing a canonical instrument key (must read 0 by EP-11, asserted), non-regulatory items sharing a normalized title and jurisdiction (reported with the pair list and the entity-identity rule from the dedup-before-grounding doctrine), sources sharing a registrable domain with more than one tier (must read 0 by SC-13, asserted); one file under docs/audits/, SELECT only under the IO budget". CLAUDE.md rule 14: every finding carries a status token; rule 1: docs cite record IDs, never restate published facts.

## Scope, exactly
1. Create `docs/audits/data-duplicate-census-2026-09-18.md` with this content, in this order (write it in your own clean prose but keep every number, id, URL, SQL and label exactly as given; no em dash, en dash or section sign anywhere):

   Title: `# Data duplicate census, 2026-09-18 (lane D2, read-only)`
   Intro: what this is (plan 6.7 row D2), the method (three SELECT-only aggregate queries run by the coordinator through the Supabase connector on 2026-09-18 23:50 to 23:58 UTC; no text column measured; no writes), and that the machine is the subject: each census item names the invariant it tests and whether the live data agrees.

   ### 1. EP-11: verified live items sharing a canonical instrument key
   Invariant: `.discipline/governance/invariants.mjs` EP-11-canonical-instrument-key; structural guard: the partial unique index `uq_intelligence_items_canonical_key_verified_live` on `canonical_instrument_key WHERE canonical_instrument_key IS NOT NULL AND provenance_status = 'verified' AND is_archived IS NOT TRUE` (migration 200).
   Query (fenced sql):
   select count(*) from (select canonical_instrument_key from intelligence_items where canonical_instrument_key is not null and provenance_status='verified' and is_archived is not true group by 1 having count(*)>1) t;
   Result: **0 twins [CONFIRMED]** over a population of 995 keyed verified-live items. The same grouping over all live statuses (dropping the provenance_status condition) also reads 0 [CONFIRMED]. The assertion holds and the index makes a new twin structurally impossible.

   ### 2. Non-regulatory items sharing a normalized title and jurisdiction
   Method: `lower(regexp_replace(trim(title),'\s+',' ','g'))` grouped with `jurisdiction_iso` and `item_type` over `intelligence_items where item_type<>'regulation' and not is_archived`. 382 distinct (title, jurisdiction, type) groups.
   Result: **1 group, 2 items [CONFIRMED]**: item_type market_signal, jurisdiction_iso {SG}, normalized title "singapore green finance incentive scheme for maritime decarbonisation":
   - 44906e93 (status in_force, provenance verified, not archived, source https://mpa.gov.sg/news-and-media/press-releases/2024/10/green-finance-incentive-scheme)
   - 64e9d38d (status in_force, provenance verified, not archived, source https://mas.gov.sg/news/media-releases/2023/mas-enhances-green-finance-incentive-scheme)
   Reading under the entity-identity rule (EP-11's "dedup before grounding: entity identity, not title"; invariants.mjs line about 375 extends it to the entity spine, migrations 282/283, ADR-024): identity is the instrument or organisation entity, not the title. These two records cite two different publishers and two different events (a 2023 MAS enhancement, a 2024 MPA release) of one named scheme. Whether they are one entity with two events or two records of one item is **[HYPOTHESIS] a duplicate pending an entity-identity ruling**; it is a data-phase item (plan 6.3), not a machine defect. The machine question this census answers: no gate today measures title-and-jurisdiction twins for non-regulatory items; EP-11's index covers keyed instruments only.

   ### 3. SC-13: sources sharing a registrable domain with more than one tier
   Invariant: SC-13-register-step-deterministic-tier (register-at-grounding assigns a tier deterministically: an existing institution-group match at eTLD+1 inherits the canonical tier). Method and its limit: host from `url` (`regexp_replace(lower(substring(url from '^https?://([^/:]+)')),'^www\.','')`), tier as `coalesce(tier_override, base_tier)`, grouped by host. This is a host-level approximation of eTLD+1 (it does not fold subdomains such as a.b.example.org into example.org), so it can undercount and cannot overcount within a host. 1,299 hosts.
   Result: **2 hosts with rows at more than one tier, both with active rows [CONFIRMED at host level]**, so the "must read 0" assertion does NOT hold on live data:
   - sec.gov, 3 rows: 390fb3eb "US Securities and Exchange Commission (SEC)" https://sec.gov/ tier 1 active; cdce56bf "SEC Climate Disclosure Rule" https://sec.gov/climate-disclosure tier 1 active; 3d283e11 "SEC Climate Disclosure Rule (17 CFR Parts 210, 229, 232, 239, 249)" https://www.sec.gov/rules/final/2024/33-11275.pdf tier 2 provisional. tier_override is null on all three.
   - cdp.net, 2 rows: bb8954b0 "CDP Supply Chain" https://cdp.net/en/supply-chain tier 5 active; 0798bcf5 "CDP / Supply Chain Program" https://www.cdp.net/en/supply-chain tier 4 active. tier_override null on both. The two URLs differ only by the www prefix: this is one page registered twice at two tiers [CONFIRMED by the URLs].
   Machine reading: SC-13 is enforced at the register step (register-step.test.mjs, unregistered-span-host-audit.mjs), which governs NEW rows; nothing re-measures existing rows against the group tier, which is how these two splits persist. Disposition, decision-ready for the coordinator and the data phase: (a) cdp.net is a duplicate source row pair (same page), to be merged in the data phase after reading which row the items and spans reference; (b) sec.gov's tier 2 provisional PDF row against two tier 1 rows is a tier ruling for the operator (a codified legal-primary host reads T1 under SC-13's own rule). Neither is fixed by this lane.

   ### 4. Standing numbers for P7
   A short table: EP-11 twins 0; title-jurisdiction groups 1 (2 items); domain-tier splits 2 hosts (5 rows). Each row says "measured 2026-09-18, coordinator SQL" and its label.

   Close with the links section: relative markdown links to `../plans/complete-system-build-plan-2026-09-04.md`, `./system-health-audit-2026-09-17.md`, and `../ops/HANDOFF-2026-09-18.md`. No wikilinks.

2. `docs/INDEX.md`: add one line in the audits section, directly after the line for `stage-audit-2026-09-18` (find it by grep), in this exact shape with a colon, never a dash glyph (pre-commit rule 022 refuses em and en dashes; the HANDOFF-2026-09-18 line in that file is the model): `- [data-duplicate-census-2026-09-18](./audits/data-duplicate-census-2026-09-18.md): ` followed by one sentence with the three numbers.
3. Session-log entry per the common contract, heading `## 2026-09-18, W9 lane D2: data duplicate census written; EP-11 0, title twins 1 group, domain-tier splits 2 hosts`. Model Haiku; the coordinator ran the SQL; no DB access in the lane.
4. Run, from the worktree root: `node fsi-app/scripts/verify/audit-finding-status.mjs 2>&1 | tail -5` (CLAUDE.md rule 14's check; an unlabeled finding fails it). If it refuses your file, fix the label, never the checker. Paste the output.
5. Commit (explicit paths: the audit file, docs/INDEX.md, docs/ops/session-log.md). Subject: `Lane D2: data duplicate census 2026-09-18 (read-only)`. Rebase, gate, push per the common contract. Report.

## Not in scope
- No SQL of your own; no database; no change to any invariant, gate, migration, or source row.
- No other docs.
