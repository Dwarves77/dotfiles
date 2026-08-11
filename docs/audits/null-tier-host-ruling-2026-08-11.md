# Batched null-tier-host ruling — 2026-08-11

**Status: applied, codified, verified.** 57 hosts ruled. 50 registered at their SC-13 class tier and
activated. 7 ruled PERMANENT WORKLIST and left unregistered by rule, forever.

Operator delegation, verbatim: *"the product intent rulings are 100% yours we built all the tools for you
to do this … you can do all of this for free."* Nothing here cost money: every step is deterministic SQL
plus deterministic pattern code. No LLM classification, no re-ground, no scheduled scan.

---

## 1. What was broken

The SC-13 null-tier-host worklist had accumulated 57 hosts. Each carried an open `integrity_flag` saying
some number of FACT spans resolved to NULL tier because the host was not in the `sources` registry.

The defect is not "these facts are low quality". It is **sub-floor masking**:

- The authority floor walls a FACT whose tier is at or below the item's floor.
- `null <= 2` is not comparable in SQL. A NULL-tier FACT therefore does not fail the floor — it **escapes**
  it. The span passes silently.
- Registering the host at its ruled class tier does **not promote** the facts. It makes the floor able to
  *see* them, so a T6/T7 span is honestly **WALLED** instead of invisibly passing.

That distinction is the whole ruling. Registering a junk-commentary host at T7 is not a favour to it.

The content-side consequence (route those facts to 4c relabel as grounded analysis) is a separate, frozen,
content step. This ruling does not pre-empt it.

## 2. The ruling

Recorded as data in **`fsi-app/scripts/_ruling/null-tier-host-ruling.mjs`** — one row per host, carrying
`[host, tier, class, reason]`. That file is the single record of the ruling; the code and the CSV are both
checked against it.

Class table (unchanged from SC-13):

| class | tier | count |
|---|---|---|
| gov / intergov | 2 | 6 |
| association / standards body | 4 | 2 |
| analysis / think tank / NGO / programme | 6 | 14 |
| lawfirm / news / vendor / corporate | 7 | 28 |
| **aggregator / hosting platform** | **never registered** | **7** |

**The 7 permanent-worklist hosts are a ruling, not an omission.** An aggregator republishes text it did not
publish; a hosting platform hosts a publication it did not publish. Either way the host is not the
publisher, so minting it any tier would credit the republisher with the publisher's authority. A span
attributing to one of them is a **re-attribution instruction**, not a registration backlog item. They are:
`legalclarity.org`, `law.cornell.edu`, `npcobserver.com`, `practiceguides.chambers.com`, `mondaq.com`,
`up.codes`, `energygovuk.citizenspace.com`.

Two rulings deserve their reasoning stated:

- **`dromon.com`** (Dromon Bureau of Shipping) is a class society by name, which would suggest the T4
  verifier class. It is **not** on the accredited-CAB allowlist. Ruled **T7**, which under-credits it
  deliberately rather than mint T4 on an unverified accreditation signal. A wrong low tier is recoverable
  by override; a wrong high tier hollow-passes a floor.
- **`inderscience.com`** is a peer-reviewed publisher but a commercial one, not a `.edu`/`.ac` institution.
  Ruled **T6** by class, not by content quality.

## 3. Codified, not just applied

A data-only ruling rots: the rows carry the decision, the code does not, and the next host of the same
class re-worklists as though nothing was ever decided. Worse, a later restore or reseed silently reverts
the rows and nothing notices.

So the ruling was written into `fsi-app/src/lib/sources/host-authority.ts` as well:

- **class rules that generalise** — `unesco.org` into `GOV_INTERGOV`; `canada.ca` into `GOV_TLD` (it is the
  Government of Canada's single official web presence, exactly the standing `.gc.ca` already had);
  `ieta.org` / `goldstandard.org` into `ASSOCIATION_ALLOW`; the ruled analysis / law-firm / news names into
  `ANALYSIS` / `LAWFIRM` / `NEWS`; `mondaq` and `up.codes` into `LEGAL_AGGREGATOR`; a new
  `HOSTING_PLATFORM` constant for Citizen Space.
- **`RULED_HOST_TIER`** — a closed per-host map for the ruled hosts no rule can derive (an Indian ministry
  programme on a bare `.in`; vendors and carrier corporate sites). Inventing a fuzzy rule for those
  (".com selling software → T7") would be the exact guess SC-13 forbids. A host not in this map and
  matching no class rule still worklists. **The no-guess guarantee is unchanged**; this map only records
  rulings already made.
- **`permanentlyUnregisteredClass(host)`** — names the never-register classes, and is now checked **before**
  `codifiedTierForHost` inside `classTierForHost`. A republisher must not acquire the publisher's authority
  by sitting on a `.gov` tomorrow.

Proven by `src/lib/sources/host-authority-ruling-conformance.test.mjs`: every one of the 57 rows must be
reproducible from the code, in both directions — a ruled tier the code will not produce, or a
permanent-worklist host the code would mint a tier for, is a failing test.

## 4. The flag shape was wrong, and would have stayed wrong

`surfaceNullTierHosts` re-opens its flag on every grounding run. For the 7 permanent-worklist hosts it kept
re-minting *"register at its canonical institutional tier"* — an instruction the ruling forbids. Resolving
those flags would not have helped: the next grounding run re-opens them with the same wrong text.

`summarizeNullTierAggregate` now has two shapes, selected by `permanentlyUnregisteredClass`:

| host | description | action |
|---|---|---|
| unruled | `Unregistered host …` | `register_source` |
| ruled aggregator / platform | `Re-attribution required for … (ruled …, never registerable)` | `reattribute_to_publisher` |

Both shapes are pinned to fit inside the 480-char `integrity_flags.description` budget **by construction**,
with a 73-char worst-case host — the caller's `slice(0, 480)` would otherwise silently truncate away the
instruction that is the entire content of the re-attribution flag. That test failed on the first draft and
the wording was shortened until it passed.

The 7 live flags were rewritten in place to the new shape, keeping their aggregate and sample spans, with
the ruling recorded as a second `recommended_actions` element that supersedes the rd28 hold placed earlier
the same day (that hold named this ruling session as its own reopen condition). They stay **open**, because
the work is real and unfinished — it is just span work, not registry work.

## 5. A false resolution I had to correct

The post-ruling verification sweep found that **8 of the 50 "registered" hosts had no `sources` row at
all**: `1point5.caneurope.org`, `balkangreenenergynews.com`, `blakes.com`, `ccarbon.info`,
`ceenergynews.com`, `freightcourse.com`, `morihamada.com`, `oneplanetnetwork.org`.

Root cause: the ruling `UPDATE` matched only **existing** rows, and the flag-resolution `UPDATE` keyed on
the ruled-host list rather than on the registration actually landing. Their flags were closed with a note
claiming *"its registry row(s) set to that base_tier and activated"*. That claim was false. 67 FACT spans
went on stamping NULL behind a resolved flag — the exact hollow-close this system exists to prevent.

Corrected: 8 rows inserted at the ruled class tier, `status='active'`, `source_role` taken **verbatim** from
`classifySourceRole` and left NULL for the three it cannot determine (`1point5.caneurope.org`,
`ccarbon.info`, `oneplanetnetwork.org`) rather than guessed. The resolution notes on those 8 flags were
amended to state plainly that the first resolution was wrong and what was actually done.

## 6. Verification

| check | result |
|---|---|
| ruled hosts with no `sources` row | **0** (was 8) |
| ruled rows whose `base_tier` ≠ ruled tier | **0** |
| ruled rows not `active` | **0** |
| institution-level tier split among the new rows | **0** |
| FACT stamp ≠ `COALESCE(tier_override, base_tier)` | **0** |
| non-FACT claims carrying a tier stamp | **0** |
| open flags matching `Unregistered host%` | **0** (was 57, then 7) |
| open `null-tier-host` flags | **7**, all `reattribute_to_publisher`, none containing `register_source` |
| discipline test suite | **1236 / 1236** |
| fitness suite | **20 functions, 0 violations** |
| invariant meta-gate | **106 invariants + 63 doctrines wired** |
| `tsc --noEmit` | clean |

## 7. Reversibility

`docs/audits/null-tier-host-ruling-2026-08-11.csv` — 60 rows, one per touched `sources` row, carrying
`source_id`, `url`, `host`, the **old** `base_tier` and `status`, the ruled tier and class, the
`source_role` at birth, and an `action` column (`UPDATE` for the 52 pre-existing rows, `INSERT` for the 8
new ones). Reversal is a per-id restore for the UPDATEs and a per-id delete for the INSERTs. The INSERT
rows also carry the ruling in `sources.notes`.

## 8. Not done here, deliberately

- **No scan was scheduled.** The data-audit lane remains `workflow_dispatch`-only and disabled in the
  Actions UI. Build mode; the operator's standing constraint does not expire because the work that
  motivated it is finished.
- **No re-ground was funded.** Nothing in this ruling spends.
- **The 4c relabel of the sub-floor facts is not done.** It is the content-side consequence, still frozen.
