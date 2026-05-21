---
id: ADR-001
title: Platform model
status: accepted
date: 2026-05-20
scope:
  - "fsi-app/src/app/(tenant)/"
  - "fsi-app/src/lib/tenancy.ts"
  - "fsi-app/src/lib/supabase-server.ts"
  - "fsi-app/src/lib/supabase-browser.ts"
  - "fsi-app/src/middleware.ts"
  - "fsi-app/src/app/api/admin/canonical-sources/"
supersedes: null
related: []
---

## Context

Caro's Ledge is a multi-tenant freight sustainability intelligence SaaS. Multiple architectural shapes were considered: single-tenant, multi-tenant flat (one row pool, tenant_id column on every table), and multi-tenant layered.

## Decision

Three-layer architecture:

1. **Platform intelligence**: shared across all tenants. Regulations, Market Intel briefs, Research briefs, Operations briefs, source registry, classification taxonomy. Operator-curated, customer-read.
2. **Workspace context**: per-tenant private data. Audit logs, tier overrides, workspace settings, user roles, custom routing.
3. **Community context**: cross-tenant social layer. Comments, upvotes, shared annotations, community sources (provisional pool).

Five customer-facing surfaces: Regulations, Market Intel, Research, Operations, Community.

Two cross-cutting capabilities: Map (geographic layer over Regulations), Intelligence Assistant (cross-surface conversational interface).

## Consequences

- Tenancy boundary is enforced at the layer, not per-table. Platform-intelligence reads bypass tenant filtering; workspace + community reads filter by tenant context.
- Routing convention: `(tenant)` route group in src/app/ for tenant-scoped pages; admin/ for platform-management routes.
- The five surfaces are not interchangeable. Build sequencing follows surface boundaries.

## Alternatives Considered

- **Single-tenant**: rejected. Caro's Ledge sells to multiple shippers/3PLs simultaneously.
- **Multi-tenant flat with tenant_id column**: rejected. Confuses platform-intelligence (shared) with workspace data (private); leaks via missing WHERE clauses.
- **Multi-tenant layered (chosen)**: explicit three-layer separation enforces the privacy/sharing distinction in the schema and route layout.

## References

- caros-ledge-platform-intent skill (Section 1: Platform Model)
- migration 075 (profiles consolidation Phase 1)
- multi-tenant prework: `docs/multi-tenant-foundation-prework-2026-05-15.md`
