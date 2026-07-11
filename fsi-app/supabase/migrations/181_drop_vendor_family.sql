-- Migration 181: drop the vendor table family (Wave-α Track E, dead-weight erase e3).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- Numbered 181 (180 = orphan RPCs/views; 164–179 reserved for Track B). Depends on nothing;
-- may apply in any order relative to 180/182+.
-- Rollback: supabase/rollbacks/181_drop_vendor_family.down.sql (recreates tables+triggers+RLS).
--
-- Scope removed 2026-05-24 (operator ruling). Confirmed dead (audit 2026-07-11 + fresh this session):
--   * Rows: vendors 0, vendor_endorsements 0, vendor_regulations 0, vendor_technologies 0.
--   * Writers/readers: ZERO in src/ (all write policies are service-only; nothing writes). The only
--     code residue was src/types/community.ts (linked_vendor_ids / vendor_endorsed / vendor union),
--     already deleted in Wave-α e2. Live grep: no .from('vendor*') anywhere in app code. [DB-4 §2(c), F11]
--   * Inbound FKs from OUTSIDE the family: NONE (pg_constraint probe = null). case_studies.linked_vendor_ids
--     and forum_threads.linked_vendor_ids are uuid[] ARRAYS, not real FKs — unaffected by these drops.
--
-- Residue NOT touched here (belongs to other decisions, deliberately out of e3 scope):
--   * notification_events CHECK value 'vendor_endorsed', notification_subscriptions CHECK 'vendor' —
--     ride the notification-v1 trio drop (DB-4 F5 / correction-plan E4).
--   * forum_sections 'vendor-reviews' seed row — rides the forum-layer decision (DB-4 F6).
--   * The shared update_updated_at() trigger fn is KEPT (used by many tables); only the
--     vendor-specific update_vendor_endorsement_count() is dropped.

BEGIN;

-- Child/edge tables first (they FK into vendors).
DROP TABLE IF EXISTS public.vendor_endorsements CASCADE;
DROP TABLE IF EXISTS public.vendor_regulations  CASCADE;
DROP TABLE IF EXISTS public.vendor_technologies CASCADE;
DROP TABLE IF EXISTS public.vendors             CASCADE;

-- Vendor-specific trigger function (the endorsement-count maintainer). CASCADE above already
-- removed the trigger objects; drop the now-orphan function.
DROP FUNCTION IF EXISTS public.update_vendor_endorsement_count() CASCADE;

COMMIT;
