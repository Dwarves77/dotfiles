# Surface spec 07: what is actually on each page

Status: DRAFT for operator review, 2026-08-12. Companion to specs 00 to 06, which describe the data
model and the gaps. **This one describes the screens.** If a component is not in this document, the
customer never sees it.

The reader throughout is a freight forwarder: art logistics, live events, luxury goods, automotive,
humanitarian cargo, expanding to general forwarding across air, road, ocean and rail. Everything below
is written from their side of the glass.

---

# REGULATIONS

**The question:** what is binding on me, when, what does it cost, what do I do.

**The one thing that makes it different from every competitor:** the page is organised by **who is
bound**, not by instrument. Every regulatory intelligence product on the market is built for the
duty-holder, and a forwarder usually is not one. Telling them which of three positions they occupy is
the product.

### What you see, top to bottom

**1. The position split.** A three-way header, and it is the first thing on the page:

```
YOUR DUTY (3)          CARRIER PASS-THROUGH (9)      CUSTOMER CONTRACT (2)
Things you must do     Things you will be billed     Things you will be asked for
```

Not a count of regulations. A count of *your* obligations, your carriers' costs, and your customers'
data demands. A forwarder who has been told for two years that "CSRD is coming for you" can see in one
glance that CSRD is in the third column at their size, and that CountEmissions EU is in the first.

**2. The deadline rail** (right side, persistent). Dated obligations with T-minus counters, filtered to
the positions above:

```
CBAM first declaration          FY2026    30 Sep 2027    T-414   YOUR DUTY
EU ETS surrender (2026, 100%)             30 Sep 2027    T-414   PASS-THROUGH
Empowering Consumers applies              27 Sep 2026    T-46    YOUR DUTY
```

**3. The obligation card**, which is the atomic unit. Not a document. An obligation is one affirmative
duty. A 40-page regulation decomposes into eight of these, and you only see the ones that apply to you.

Each card carries:

- **Plain language first.** "If you publish a gCO2e/t-km figure in a tender, a quote, a customer report
  or your marketing, you must calculate it the prescribed way."
- **The verbatim provision underneath**, collapsed, with a pinpoint citation to article and paragraph
  and the **as-at date of the text we assessed**. This is what you forward to a customer or an auditor.
- **Why it is on your list.** "Because you operate as an indirect customs representative in the EU."
  That trigger is a profile attribute you can see and change. An applicability decision with no visible
  reason is indistinguishable from a guess.
- **What to do**, as a task with an owner and a due date.
- **Evidence to keep**, and for how long.
- **Your position on it**, exactly three values: Yes / No / **Not assessed**. Not-assessed is a
  first-class state, never a blank. Every richer status taxonomy collapses in practice.
- **Cost, only where a formula exists.** FuelEU shows the actual penalty formula and the €2,400 per
  tonne VLSFO-equivalent unit price. CSRD shows "Member State set, discretionary" and nothing else.
  Putting a modelled estimate in the same visual slot as a statutory figure destroys trust faster than
  showing nothing.

**4. The horizon lane**, visually and structurally separate from binding. Roughly 5% of proposed
legislation becomes law. The IMO Net-Zero Framework lives here, marked *not adopted, decision 4 Dec
2026*, and it must never sit in a list next to something that binds today.

**5. The change feed**, filtered by your applicability, with major/minor classification and a
provision-level red/green diff. Critically it catches the **implicit** change: an annex or an emission
factor table moves while the parent text is untouched. In freight sustainability that may be the
majority of what actually changes, and diffing statutes alone misses all of it.

**6. Export.** Point-in-time snapshot to Excel or PDF. Often the most-used feature in this category,
because the real job is handing something to procurement, an insurer or an auditor.

### Why it is built this way

The defensibility test the page has to pass: *on 14 March, what did we believe applied to us, on what
basis, who said so, and against which text version?* Everything above exists to answer that. Position
split answers "was it even ours". Pinpoint plus as-at answers "against which text". Trigger answers "on
what basis". Owner and status answer "who said so".

---

# MARKET INTEL

**The question:** what is moving, by how much, and am I ahead or behind.

**The one thing that makes it different:** carbon cost rendered as part of the freight rate, per
corridor, per container. Drewry already includes the EU ETS surcharge inside its World Container Index,
so the industry has conceded that carbon is a freight cost. Nobody shows a forwarder the decomposition
against their own lanes.

### What you see, top to bottom

**1. The comparative ribbon.** Eight to ten metrics across the top, each identical in shape:

```
EUA          €78.40   +1.2%  +4.8%  +22.1%   ▁▂▄▅▇   as-of 11 Aug
EU diesel    €1.62/L  −0.4%  +2.1%   +8.7%   ▇▅▄▃▂   as-of 07 Aug
Jet kero     $2.31/g  +0.8%  −1.4%   +5.2%   ▃▄▅▄▆   as-of 08 Aug
```

Level, then change over one week, one month, one year, then a sparkline, then the as-of date. This is
the 15-second "has anything moved that changes my week" read, and it is the contract in its most
literal form.

**2. The corridor rate board.** Your lanes, not a global average:

```
Shanghai → Rotterdam    market low €1,840 ─────●───── high €4,120
                                          your rate €3,650   (87th pctile)
                        spot €2,940   contract €3,180   spread widening
```

The band is the product. Your own rate plotted inside it is the entire value proposition, and it comes
straight from how Xeneta built their franchise. The spot-to-contract spread is the forward signal:
contract lags spot by about a quarter, so a widening spread says your renewals reprice up.

**3. The carbon overlay**, on the same corridor:

```
Of €3,650:   EU ETS €96/FEU   ·   2.6% of rate   ·   trending +18% YoY
             at 100% phase-in from 2026 (was 70% in 2025)
```

This is the join to Regulations. The obligation lives there; the price lives here.

**4. The signal feed.** Every item is either a SIGNAL or a FACT, and the transition between them is a
timestamped event:

```
[SIGNAL] Second EU carrier signals methanol bunkering at Rotterdam
         2 independent sources · confidence MODERATE
         first seen 4d ago · last movement 6h ago · UNCONFIRMED
[FACT]   CountEmissions EU published in Official Journal
         source: OJ L series · verified 02 Jun 2026
```

Corroboration counts **independent origins**, not mentions: three trade-press pickups of one press
release is corroboration of one. And the gap between "we flagged it" and "it became fact" is the
product's headline KPI, which is why the promotion event is stored and never rewritten.

**5. The lead-time chart.** The contract's third clause, made literal. X-axis in months, not score:

```
                    −12m        today        +12m       +24m
forwarding median              ●
you                                    ●  (+7m ahead)
automotive OEM cohort   ●─────────────  (−14m: they are ahead of you)
```

Read: your automotive customers are fourteen months ahead of you on this, so it will show up in their
next tender. That converts "sustainability pressure" into a date.

**6. Capacity and reliability, forward twelve weeks.** Deployed capacity, blank sailings, schedule
reliability, average delay. Physical signals lead price, and for a time-critical art or live-events
shipment reliability matters more than rate.

**7. Methodology drawer**, one click from any number: how it was derived, sample size, refresh cadence,
version. So you can forward the screenshot to your customer's procurement team without a caveat.

### Why it is built this way

Because a number a professional will budget on has to carry its jacket. Every figure shows derivation
class, basis, sample size and as-of. Anything past its refresh cadence renders visibly degraded rather
than silently stale. Ratios move in percentage points, quantities in percent, enforced at the component
level. These are not fussy details; they are the difference between a product someone trades on and a
newsletter.

---

# RESEARCH

**The question:** what is emerging, who is studying it, and how does it change my plan.

**The one thing that makes it different:** the atomic unit is an *assessment*, not a paper. One
assessment may draw on forty sources and you never read one of them. If a card cannot say what
planning assumption it changes, it does not ship as a card.

### What you see, top to bottom

**1. Horizon bands as the primary organisation**, not a reverse-chronological feed:

```
NOW (0–2y)    NEAR (2–5y)    MID (5–10y)    FAR (10y+)    UNRESOLVED-DECAY
```

That last band is the one nobody ships and the most useful: *obsolete before it arrives, do not build a
plan on this*. A forwarder needs to be told what to ignore as much as what to watch.

**2. The assessment card.**

```
Methanol bunkering crosses routable threshold on Asia–Europe

HORIZON    NEAR · trigger 2028 · because FuelEU intensity step + 3 announced
           bunkering nodes. Basis: R1 statute + R3 roadmap.
MATURITY   TRL 9–11 (technical) · CRI 4 (still policy-driven, subsidised)
           Binding constraint: BUNKERING INFRASTRUCTURE — high
CONFIDENCE Medium · evidence ROBUST, agreement MEDIUM
           ↓ indirectness: most studies are deep-sea, your lanes are short-sea
WHO        3 independent institution clusters, 2 jurisdictions
           1 national lab · 1 class society · 2 VENDOR-FLAGGED
DISSENT    One class society disputes the availability timeline →
```

Three things to notice. Maturity is a **range, not a point**, and it is three independent axes because
"does it work" and "can I buy it" and "what blocks me" are different questions. The binding constraint
is named, because "ARL 4" is not actionable and "bunkering infrastructure: high" is. And **dissent is a
first-class field**: where credible sources disagree, that disagreement *is* the finding, and it says
hedge rather than commit.

**3. The so-what block**, bound to your own plan:

```
ASSUMPTION AT RISK  You assume Asia–Europe stays conventionally bunkered to 2030
BECOMES             A methanol-capable option exists on this lane from 2028 and
                    your automotive client's tender will ask for it
LOAD-BEARING        Yes — sits under 34% of quoted margin on this trade
SIGNPOSTS           Rotterdam publishes bunkering tariff (confirms)
                    Third carrier orders dual-fuel for this string (confirms)
                    Node build slips past Q3 2027 (delays)
DECISION DEADLINE   Q1 2028, set by your contract renewal cycle
```

The signposts are **machine-watchable**, which is what makes the page maintain itself and satisfies the
no-editorial-queue ruling by construction rather than by policy.

**4. The change ledger.** Every prior horizon, maturity and confidence value, with the date and the
cause. A horizon assessment must be able to be wrong in public and be seen to have been wrong. A card
that silently rewrites its own history is marketing.

**5. Coverage and gap map.** What the intake watches and what it does not, so a thin rail reads as "we
are not covering rail deeply" rather than "rail is settled."

### Why it is built this way

Because the failure mode of this category is the paper summary: "researchers at X found Y", which is
interesting and changes nothing. Every field above exists to force the card past that. And credibility
is deliberately split in two, evidence quality separate from who is asserting it, because a vendor
consortium producing internally consistent robust evidence must read as *high evidence, low
independence* in one glance.

---

# OPERATIONS

**The question:** where should I do this, and is it cheaper to automate or to hire.

**The one thing that makes it different:** you can put two regions on one axis. Today you cannot,
anywhere in the product.

### What you see, top to bottom

**1. The comparison matrix**, which is the page:

```
                        EU-NL      US-TX      UK        UAE       ASIA-SG
Electricity  €/kWh      0.142      0.081      0.198     0.061     0.198
                        100        57         139       43        139
Labour       €/prod-hr  38.20      31.40      34.80     14.20     22.60
                        100        82         91        37        59
Materials               ●●●○○      ●●○○○      ●●●●○     ●○○○○     ●●●○○
Infrastructure          ●●●●●      ●●●●○      ●●●●○     ●●●○○     ●●●●●
Recyclate supply        —          —          ●●●○○     ●○○○○     ●●○○○
```

Native value on top, index against **your chosen base region** underneath. You pick the base; a
hard-coded base smuggles in a point of view, and a Dutch forwarder and a Polish forwarder ask the same
question from different origins.

The dashes are deliberate and honest. EU and US genuinely have no sourced data on five dimensions
today, and showing that as a row of dashes in one glance is better product behaviour than hiding it
behind collapsed accordions, which is what happens now.

**2. Click a dimension, get the cross-region column.** That is the whole interaction the current
control promises in its accessibility label and then fails to deliver, drawing a border instead.

**3. The labour chain, expanded, because the chain is the content:**

```
Base wage (BLS OEWS, HVAC mechanic, TX)        $28.40/hr
+ employer contributions (BLS ECEC, 31%)        $8.80
+ leave and absence                             $2.10
+ turnover and recruitment                      $1.60
+ shift premium                                 $1.20
÷ productive hours (1,640 of 2,080)            ×1.27
= FULLY LOADED                                 $53.90 per productive hour
```

Decisions here are routinely wrong because somebody used the headline wage. Showing the chain is what
prevents that.

**4. Automate versus hire, with break-even given equal billing to the answer:**

```
HVAC monitoring system vs 2 FTE — US-TX

NPV (7yr, 8%)         +$184,000 favouring automation
Discounted payback     3.4 years
Levelised cost         $0.41 per pallet-position-month

BREAK-EVEN WAGE       $38.10/hr  ← below this, hiring wins
BREAK-EVEN UTILISATION      61%  ← below this, nothing pays back
Your current: wage $53.90, utilisation 74%

Most sensitive: utilisation ▓▓▓▓▓▓ wage ▓▓▓▓ ramp ▓▓ energy ▓
```

The break-even wage is the field that actually answers the question, because it converts a point
estimate into something you can defend in a meeting.

**5. Feasibility gates, evaluated *before* cost and rendered as gates, never as points:**

```
EU-NL   PPWR recycled content 2030   CONDITIONAL — rPET supply thin
US-TX   Permitting                   CLEAR
UAE     EPR registration             BLOCKED — no authorised representative
```

The 2026 site-selection survey data has feasibility overtaking price as the binding constraint. A
surface that scores feasibility instead of gating it gets the decision backwards: no amount of cheap
electricity un-blocks a legal prohibition.

**6. Coverage ledger per region.** "EU-NL: 14 of 22 indicators, oldest reference period 2023." A
comparison across regions with unequal data density is a comparison of data density.

### Why it is built this way

Because the OECD/JRC handbook on composite indicators warns, in its own words, that they "may be misused
to support a desired conclusion if the construction process is not transparent" and "may disguise
serious failings in some dimensions." Every cell therefore carries its source, dataset code, reference
period and status flag; nothing is ever silently imputed; and if a derived answer depends on more than
about a fifth imputed inputs, we suppress the answer and show the components instead.

---

# COMMUNITY

**The question:** what are peers actually seeing, that no dataset will tell me.

**The one thing that makes it different:** it is a room shared by direct competitors, so it is built
antitrust-first. The platform knows exactly who you are; the room does not.

### What you see

**1. Your profile as others see it:** role, industry, company size, region, and a verification badge.
Not your name, not your company. That is Gartner Peer Insights' resolution to the same problem, and it
is what makes a forwarder willing to say something true.

**2. Threads bound to entities**, not free-floating. A thread attaches to a corridor, a jurisdiction, an
instrument or a technology, which is how it becomes reachable from the other four pages.

**3. The house benchmark**, on a fixed calendar, aggregate-only:

```
This quarter: what SAF premium are you seeing on EU–US air?
   n = 34 respondents, 19 organisations
   <5%: ████ 12%     5–10%: ████████████ 41%     10–20%: ██████ 29%
   >20%: ███ 18%
   Aggregated, historical, ≥5 contributors, no contributor >25%
```

We generate these rather than waiting for organic critical mass, because the empty room kills a
professional community in about eight weeks.

**4. A posting guard that refuses, and explains.** Current or forward pricing, capacity plans and wage
data are the three categories that have been held to violate the Sherman Act. The guard enforces
k-anonymity, a contributor dominance cap and a lag at write time, and offers the aggregate-only route
instead. It refuses rather than flags, because a re-disaggregable dataset cannot be un-published.

**5. No direct messaging.** Deliberate, and the same anti-solicitation control Gartner uses.

**6. A visible promotion path.** Community content that becomes product content moves through five
states you can watch, and it never renders as verified until an editor has traced it to a primary
source. The thread gets credited as the lead; the primary source gets cited.

---

# HOW THE FIVE FIT TOGETHER

One corridor, Shanghai to Rotterdam, seen from each page:

| Page | What it tells you about that corridor |
|---|---|
| Regulations | EU ETS binds your carrier at 100% from 2026; you are pass-through, not duty |
| Market Intel | Rate €3,650, 87th percentile of the band; €96/FEU of it is carbon, up 18% |
| Research | Methanol becomes routable here around 2028; your automotive client is 14 months ahead |
| Operations | Rotterdam node capacity is strong; EU recyclate supply is thin for PPWR |
| Community | 41% of peers report a 5–10% SAF premium on the adjacent air lane |

They agree because they are five lenses on one spine, and the corridor is the same object in all five.
That is the entire architectural bet, and it is why the spine work comes before the page work.

**The test:** hand someone one corridor and one regulation and ask them to reach every relevant item on
all five pages without using search. If any page answers zero questions, it is decoration. If any page
answers more than one, it is a dashboard. If they hit a dead end, the spine has a hole there.
