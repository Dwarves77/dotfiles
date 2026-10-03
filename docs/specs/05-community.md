# Surface spec 05: Community

Status: DRAFT for operator review, 2026-08-12.

**Contract.** Community is a core customer-facing surface, co-equal with the four intelligence pages,
addressing the freight industry's structural information-isolation problem. It is **human-operated by
construction and outside machine intake** (`community-is-human-space`, operator ruling 2026-07-12), so
`no-human-finish-of-intake` and `machine-gates-are-approval` do not apply here.

**Community is social only (ADR-041, operator ruling 2026-10-03).** Community is a place for people to
discuss what they are doing in their own regions. It is not a source of information: nothing posted in
Community feeds, is counted on, or is promoted into any page or pipeline outside `/community`. A system
page may link into Community; Community never feeds back out. The promotion path, editorial pickup and
every outbound count were removed (see "Community is social only" below).

**Current verdict.** Not re-verified in depth this pass. Working groups, forums and promote-to-public
(a repost inside Community) shipped per Workstream B. Community was deliberately scoped separately from
the four intelligence surfaces because its contract is a different shape. This spec is the target, not
an audit.

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

## 4. Community is social only (ADR-041)

Operator ruling, 2026-10-03, verbatim: "Community is a resource for people to discuss what they're doing
in their own regions and how they're working through things if they wanna link a regulation or something
that they wanna talk about from the system that's OK, but we should not be using community to feed data
into the rest of the pages absolutely not." And: "It is a social place. It is not a source of
information."

The rule: system to Community links are allowed. No Community-derived content, count, state or aggregate
may appear on, or feed, any page or pipeline outside `/community` (and its own API). The five-gate
promotion path, the editorial pickup pipeline, the cross-surface "peers are discussing this" strip, the
Map community dots, the Dashboard Community counts and the admin pickups queue are removed. See
`docs/decisions/ADR-041-community-is-social-only.md`.

## 5. Required components

| # | Component | Why |
|---|---|---|
| 1 | **Verified-identity, pseudonymous-display profile** (role, industry, company size, region; not name or company) with a verification badge | §2. The precondition for competitors sharing a room |
| 2 | **Entity-bound posting**: every thread binds to spine entities (corridor, jurisdiction, instrument, technology, organisation) | Makes Community reachable from the other four surfaces and from the portfolio, rather than a walled forum |
| 3 | **Structured aggregate-only instruments** (polls, benchmark surveys) with write-time k-anonymity and dominance enforcement | §1. Also the highest-value proprietary data the product can generate |
| 4 | **House-seeded recurring benchmark on a fixed calendar**, scoped to the reader's portfolio | §3. The anti-empty-room mechanism |
| 5 | **Corroboration counter** showing independent organisations, not post count | Superseded by ADR-041 (it fed the removed gate 2) |
| 6 | **Promotion state machine**, states publicly visible, transitions logged | Superseded by ADR-041 |
| 7 | **Time-decay on contributed evidence**, visible as an age chip | Superseded by ADR-041 (it belonged to the removed promotion path) |
| 8 | **No direct messaging** | §2. Explicit anti-solicitation and anti-collusion control |
| 9 | **Working groups and forums** with region and sector structure, seeded from `sector_profile` on workspace creation | The shipped Workstream B components, plus the seeding gap named in platform-intent |
| 10 | **Editorial pickup pipeline** (an editor surfaces a public thread inside platform intelligence) with the gate-4 provenance treatment | Superseded by ADR-041 |
| 11 | **Author identity rendering**: org type + role + sector + region, from the pseudonymity-safe subset | Named as a gap in platform-intent §COMMUNITY |
| 12 | **Antitrust posting guard with a refusal explanation** | §1. Refuse, explain, offer the aggregate-only route |

## 6. Acceptance criteria

1. Superseded by ADR-041. (Was: zero `community` records reachable from any Operations figure or verified aggregate; the rule is now stronger, no Community content reaches any page outside `/community`.)
2. Superseded by ADR-041. (There is no path from Community to `verified` at all.)
3. Posts to commercially sensitive fields violating k-anonymity, the 25% dominance cap or the three-month
   lag are **refused at write time**, not flagged.
4. Superseded by ADR-041. (Community items are not surfaced on other surfaces.)
5. Direct messaging does not exist.
6. Every thread binds to at least one spine entity.
7. Superseded by ADR-041 (the corroboration counter was removed).
8. Superseded by ADR-041 (the evidence age chip was removed).
9. Superseded by ADR-041. (The Assistant does not read Community at all.)

## 7. Gap: current state vs this spec

Working groups, forums and promote-to-public (a repost inside Community) are shipped. Editorial pickup
and the promotion machine are removed (ADR-041). Everything in section 1 (antitrust guard), section 2
(verified-pseudonymous identity) and section 3 (house seeding) is **absent** at this spec date unless built since. Author-identity rendering, region and group
structure on the index, AI prompt bar wiring, the topic-by-region matrix and sector-driven group seeding
are the gaps already named in platform-intent and remain open.

**Recommended sequencing note.** The antitrust posting guard (§1) and the `origin_class` vocabulary
(`00-foundation` §3.6) are the two items that must exist before any expansion of Community usage, because
both are unfixable retroactively: a re-disaggregable dataset cannot be un-published, and content ingested
without a provenance class cannot be reliably reclassified later.
