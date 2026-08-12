# Surface spec 05: Community

Status: DRAFT for operator review, 2026-08-12.

**Contract.** Community is a core customer-facing surface, co-equal with the four intelligence pages,
addressing the freight industry's structural information-isolation problem. It is **human-operated by
construction and outside machine intake** (`community-is-human-space`, operator ruling 2026-07-12), so
`no-human-finish-of-intake` and `machine-gates-are-approval` do not apply here. Human approval,
curation and promotion affordances are legitimate by design.

**The one doctrinal edge, already registered:** content promoted from Community into the intelligence
corpus carries its own provenance class, community-originated and human-promoted, and **never renders as
machine-grounded or verified**. Enforcement of that labelling is a known gap with a named landing point.

**Current verdict.** Not re-verified in depth this pass. Working groups, forums and promote-to-public
shipped per Workstream B; the editorial pickup pipeline is absent or stubbed. Community was deliberately
scoped separately from the four intelligence surfaces because its contract is a different shape, and it
needs its own read before build. This spec is the target, not an audit.

---

## 1. The one thing that can end the product: antitrust

This must be designed in before anything else, because it is acute for freight, where forwarders compete
directly on rate, and because it is not fixable by a policy page.

Defensible-exchange criteria from current US practice: **historical data only (older than roughly three
months)**, **aggregated across at least five participants with no participant contributing more than 25%
of the total**, **fully anonymised**, and **administered by a neutral third party** rather than
competitor to competitor. Dangerous categories: current or forward-looking pricing, which has been
"consistently held to violate the Sherman Act"; capacity and output plans; and wage data
([Winston & Strawn](https://www.winston.com/en/blogs-and-podcasts/competition-corner/searching-for-safe-harbor-navigating-information-exchanges-moving-forward),
[ABA Antitrust](https://www.americanbar.org/groups/antitrust_law/resources/magazine/2025-fall/benchmarking-information-sharing-enforcers-tale/)).

The modern caveat matters: agencies now recognise that AI can **re-disaggregate** supposedly anonymised
sets, so the old safe-harbour arithmetic is a floor, not a defence.

**Caro's Ledge is the neutral third-party administrator.** Smart Freight Centre's Shippers Alliance is
the domain-native precedent for a neutral convenor running structured collaboration
([Smart Freight Centre](https://www.smartfreightcentre.org/en/our-programs/freight-buyers/smart-freight-shippers-alliance/)).

**Build the k-anonymity and dominance checks into the posting pipeline and refuse the post. Do not rely
on a policy page, and do not flag-and-publish.** For any commercially sensitive field: minimum five
contributors, no contributor above 25% share, and a lag of more than three months, enforced at write
time.

## 2. Identity: verified backing, displayed pseudonymity

Gartner Peer Insights and Peer Community solve the competitor problem in a way that transfers directly.
Reviewers must hold an identifiable corporate email matching their stated company, corroborated against
Gartner profiles or LinkedIn; verified members carry a blue checkmark, explicitly to eliminate "the
distractions of self or brand-promotion, sales, and recruiting"
([Gartner Peer Insights FAQ](https://www.gartner.com/reviews/faq)).

But profiles display **job title, role, industry and company size, and not name or company**,
specifically to prevent personal identification, and private messaging between reviewers is
**prohibited**.

**The platform knows exactly who you are. The room does not.** That is the resolution to a space shared
by competitors, and it is the model to adopt.

Structural anti-gaming to copy: one post per vendor per category per member; attestation that the member
is neither employed by nor a competitor of a vendor being discussed; write-in verification; reportable
illegitimate content.

The alternative model, Bloomberg IB, works because identity *is* the paid terminal login, real and
employer-attributed, and because chat is entity-linked back into the terminal via NLP extraction of
security details and intent. Compliance there is a feature, not a tax
([Instant Bloomberg](https://professional.bloomberg.com/products/bloomberg-terminal/collaboration-tools/instant-bloomberg)).
Our analogue is that every post binds to entities on the spine (`00-foundation` §1).

## 3. Seeding: the house fills the well

The dominant failure is the empty room, and it kills a professional community in about eight weeks.
Gartner does not wait for organic critical mass: it runs its own **Benchmark Surveys** and publishes
**One-Minute Insights**, house-generated fast-to-read peer benchmarks, alongside member Q&A, polls and
discussion.

**Requirement:** a fixed-calendar, in-product, recurring benchmark poll scoped to the reader's portfolio.
Domain examples: "what SAF premium are you seeing on EU-US air lanes this quarter", "how many of your
2026 tenders asked for ISO 14083-conformant figures", "who has been asked to be a CBAM indirect
representative". Each is a structured, aggregate-only instrument that clears the §1 gates by
construction and produces content nobody else has.

Incentives stay deliberately small: Gartner caps gifts at nominal value, roughly $25, with mandatory
disclosure when offered.

Moderation is editorial, not merely policing: submissions assessed for context, quality and relevance,
with members asked for more information *before* publication. Named removal grounds: plagiarism, generic
content, impersonation, abuse, PII, confidential or financial data, unproven fraud accusations.

## 4. The promotion path into product content

Five gates. Each changes `origin_class` (`00-foundation` §3.6). None may be skipped.

1. **`community`** — posted. Visually distinct container, author role chip, "unverified, contributed by
   a member". **Never enters an Operations calculation, never appears in an export, never cited by the
   Assistant as fact.**
2. **`community-corroborated`** — at least 3 independent verified members from at least 3 distinct
   organisations, no organisation above 25% of respondents, asserting consistent facts. Still labelled
   unverified. Now eligible to appear as a *signal* on Market Intel **with the distribution shown, never
   as a point estimate**.
3. **`under-review`** — an editor has opened a verification task. **Publicly visible state**, which is a
   trust-builder rather than an embarrassment.
4. **`verified`** — an editor has traced the claim to a primary source and attached a PROV chain. **The
   community post becomes a `wasInformedBy` edge, not the source.** The published record cites the
   primary source; the thread is credited as the lead.
5. **`retired`** — corroborated-then-contradicted content gets a tombstone with the correction, never
   deletion, and everyone whose portfolio touched it is notified.

Two firewalls from Gartner, both applicable: individual quotes do not appear in published client-facing
insight, and peer input is explicitly one input among many for analyst research. And **time decay**:
Gartner halves review weight every 12 months (100% at 0-12 months, 50% at 12-24, 25% at 24-36). This
transfers directly. **A corroborated 2024 SAF premium is not evidence about 2026.**

## 5. Required components

| # | Component | Why |
|---|---|---|
| 1 | **Verified-identity, pseudonymous-display profile** (role, industry, company size, region; not name or company) with a verification badge | §2. The precondition for competitors sharing a room |
| 2 | **Entity-bound posting**: every thread binds to spine entities (corridor, jurisdiction, instrument, technology, organisation) | Makes Community reachable from the other four surfaces and from the portfolio, rather than a walled forum |
| 3 | **Structured aggregate-only instruments** (polls, benchmark surveys) with write-time k-anonymity and dominance enforcement | §1. Also the highest-value proprietary data the product can generate |
| 4 | **House-seeded recurring benchmark on a fixed calendar**, scoped to the reader's portfolio | §3. The anti-empty-room mechanism |
| 5 | **Corroboration counter** showing independent organisations, not post count | Feeds gate 2 and mirrors Market Intel's corroboration rule |
| 6 | **Promotion state machine**, states publicly visible, transitions logged | §4 |
| 7 | **Time-decay on contributed evidence**, visible as an age chip | §4 |
| 8 | **No direct messaging** | §2. Explicit anti-solicitation and anti-collusion control |
| 9 | **Working groups and forums** with region and sector structure, seeded from `sector_profile` on workspace creation | The shipped Workstream B components, plus the seeding gap named in platform-intent |
| 10 | **Editorial pickup pipeline** (an editor surfaces a public thread inside platform intelligence) with the gate-4 provenance treatment | The in-flight component; the provenance treatment is what makes it safe |
| 11 | **Author identity rendering**: org type + role + sector + region, from the pseudonymity-safe subset | Named as a gap in platform-intent §COMMUNITY |
| 12 | **Antitrust posting guard with a refusal explanation** | §1. Refuse, explain, offer the aggregate-only route |

## 6. Acceptance criteria

1. Zero `community` records reachable from any Operations figure or verified aggregate (lineage check).
2. No path from `community` to `verified` without an editor action and a primary-source PROV chain.
3. Posts to commercially sensitive fields violating k-anonymity, the 25% dominance cap or the three-month
   lag are **refused at write time**, not flagged.
4. Community items surfaced on other surfaces carry the unverified label **in that context too**.
5. Direct messaging does not exist.
6. Every thread binds to at least one spine entity.
7. Corroboration counts distinct organisations, not posts.
8. Contributed evidence displays its age and decayed weight.
9. The Assistant never cites a `community` record as fact.

## 7. Gap: current state vs this spec

Working groups, forums and promote-to-public are shipped. Editorial pickup is absent or stubbed.
Everything in §1 (antitrust guard), §2 (verified-pseudonymous identity), §3 (house seeding), §4 (the
five-gate promotion machine) and the `origin_class` propagation is **absent**, and `origin_class` itself
does not exist as a vocabulary anywhere in the product. Author-identity rendering, region and group
structure on the index, AI prompt bar wiring, the topic-by-region matrix and sector-driven group seeding
are the gaps already named in platform-intent and remain open.

**Recommended sequencing note.** The antitrust posting guard (§1) and the `origin_class` vocabulary
(`00-foundation` §3.6) are the two items that must exist before any expansion of Community usage, because
both are unfixable retroactively: a re-disaggregable dataset cannot be un-published, and content ingested
without a provenance class cannot be reliably reclassified later.
