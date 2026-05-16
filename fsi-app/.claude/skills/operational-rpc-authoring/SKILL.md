---
name: operational-rpc-authoring
description: STUB. RPC patterns for Supabase. SECURITY DEFINER with auth.uid() membership check. Closes audit S11 (7 page RPCs accept any p_org_id without checking auth.uid() membership = soft confidentiality leak).
---

# Operational: RPC Authoring

## Purpose

When a new RPC (Postgres function exposed via Supabase) is needed, this skill provides the patterns for:
- Correct SECURITY DEFINER posture
- auth.uid() membership check before returning workspace data
- Idempotent function declaration (DROP FUNCTION IF EXISTS + CREATE OR REPLACE)
- Return type stability for PostgREST

## When to use

- New page-data RPC (e.g., the per-surface-frame RPCs Section 6.9 implies)
- New write RPC (e.g., for confirmed classifications from review queue)

## Critical pattern: auth.uid() membership check

The audit found 7 SECURITY DEFINER RPCs (`get_workspace_intelligence`, `get_market_intel_items`, `get_research_items`, `get_operations_items`, dashboard/listings/slim/aggregates variants) accept `p_org_id` without checking `auth.uid()` membership. This is a soft confidentiality leak waiting for a second tenant.

Required pattern:
```sql
CREATE OR REPLACE FUNCTION get_workspace_intelligence(p_org_id UUID)
RETURNS TABLE (...) AS $$
BEGIN
  -- Authorization check FIRST
  IF NOT EXISTS (
    SELECT 1 FROM org_memberships
    WHERE org_id = p_org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of org %', p_org_id;
  END IF;

  -- Now the actual query
  RETURN QUERY
  SELECT ...
  FROM intelligence_items
  WHERE ...;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

## Process (TO REFINE)

1. Identify the function's purpose and authorization needs
2. Decide SECURITY DEFINER vs INVOKER (DEFINER for cross-RLS reads with explicit auth check; INVOKER respects RLS)
3. Write auth check FIRST in function body
4. Write idempotent declaration
5. Document return type (PostgREST consumes it)
6. Add to migration via [[operational-migration-authoring]]

## Inherits

- [[rule-cross-reference-integrity]] (RPCs read from canonical stores; don't bypass)

## Composition

Used by feature work that adds new query surfaces. Composed with [[operational-migration-authoring]].

## Audit cross-reference

- v2 audit Section 3 / S11 (multi-tenancy schema-only; soft confidentiality leak in 7 RPCs)
- v2 audit Section 6.8 (authorization on workspace-scoped RPCs is non-negotiable)
- Schema audit: enumerates all 7 affected RPCs
