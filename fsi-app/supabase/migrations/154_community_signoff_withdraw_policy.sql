-- 154_community_signoff_withdraw_policy.sql
--
-- ADDITIVE follow-on to migration 153 (community_post_signoff_requests).
-- Does NOT touch 153's table, index, or its three policies (signoff_select,
-- signoff_insert, signoff_decide) — it only ADDS one UPDATE policy.
--
-- WHY: migration 153 shipped the sign-off request lifecycle with three RLS
-- policies. The only UPDATE policy (signoff_decide) is restricted to active
-- verifiers / platform admins, so a plain requester has NO RLS path to
-- withdraw their own still-open request. Withdraw is part of the request
-- lifecycle (community-schema-mapping.md §3.1: "requester withdraws own
-- pending request"), so the requester needs a scoped UPDATE path.
--
-- This policy is deliberately narrow: it lets the requester move ONLY their
-- OWN request, ONLY while it is still 'pending', and ONLY to 'withdrawn'. It
-- cannot sign a post off, cannot touch another user's request, and cannot
-- re-open a decided request. It never overlaps signoff_decide's grant.
--
-- Postgres RLS UNIONs permissive policies of the same command, so adding this
-- policy widens UPDATE access for exactly this one transition without loosening
-- signoff_decide. (with_check pins the resulting row to the withdrawn shape;
-- using pins the pre-image to the requester's own pending row.)
--
-- STATUS: committed with the T11 sign-off wiring PR; applies via the migration
-- track (code-vs-data separation, CLAUDE.md), NOT by the PR merge. Until it is
-- applied, POST /api/community/signoff/[id]/withdraw matches 0 rows and returns
-- 404 (safe pre-apply); create + verifier-decide work against 153 immediately.

create policy signoff_withdraw_own on public.community_post_signoff_requests
  for update
  using (
    requested_by = auth.uid()
    and status = 'pending'
  )
  with check (
    requested_by = auth.uid()
    and status = 'withdrawn'
  );
