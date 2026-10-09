## Section 8: Customer-Facing Signal Sets Per Surface

Per Q9. Per-surface signal sets with consistent vocabulary across surfaces. Asymmetry is deliberate per audience need.

| Surface | Primary credibility signals |
|---|---|
| Regulations | tier + jurisdiction + binding status |
| Research | tier + bias tag + citation count + recency |
| Market Intel | tier + recency + signal-strength |
| Operations | tier + jurisdiction + applicability |
| Community | author identity + workspace verification |
| Map | tier (overlay over Regulations) |
| Assistant | inline citations with full provenance |

**Canonical domain INT-to-surface mapping** (1-7): see `fsi-app/src/lib/domains.ts` for the single source of truth consumed by both the Haiku classifier (via `domainForItemType`) and the surface filters on /regulations, /market, /operations, /research, and the Dashboard surface-coverage widget. Domain integers MUST NOT be hardcoded outside that file; use the named exports (`REGULATIONS_DOMAIN`, `RESEARCH_DOMAIN`, etc.) instead. The migration 101 routing rule is the authoritative branch logic and is mirrored verbatim in `domainForItemType`.

### Per-surface implementation is build-dispatch scope

This section specifies WHAT signals each surface foregrounds. Build dispatches specify HOW (visual treatment, badge style, expand-on-click panel structure, color coding). Per-surface implementation lands per Tier 4 build:

- Build 7 Market Intel: tier + recency + signal-strength
- Build 8 Research: tier + bias tag + citation count + recency
- Build 9 Operations: tier + jurisdiction + applicability
- Build 10 Community: author identity + workspace verification (separate model, see below)
- Build 11 Dashboard: aggregates across surfaces

### Vocabulary consistency

Tier badge means the same everywhere (T1-T7 with the same labels and colors). Jurisdiction renders the same way wherever it appears. Bias tags render consistently when present. Customers learn the signal vocabulary once and recognize it across surfaces.

### Community surface uses a different model

The Community surface renders user-generated content. The bias tag vocabulary applies to external publisher sources only and does not apply to Community content. Community credibility uses author-identity-shaped signals:

- Author identity (verified member, organization affiliation)
- Workspace verification (member is associated with a verified workspace)
- Posting history (operator-tunable signal weight)
- Future moderation signals (flagged content, peer endorsement, etc.)

When a member shares a FreightWaves article on Community, the FreightWaves source carries its bias tags (separate sources-registry signal); the member's act of sharing carries author-identity signals (Community model). Both render on the Community surface side by side.
