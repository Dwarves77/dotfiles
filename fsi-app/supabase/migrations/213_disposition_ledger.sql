-- 213_disposition_ledger.sql
--
-- TOMBSTONE-THEN-DELETE (operator amendment 2026-07-16): a verified-correct archive is DELETED to reach zero
-- archived items, but its IDENTITY is written HERE FIRST — permanent institutional memory so the holdings-gate
-- and expansion-time dedup can forever answer "was this instrument already evaluated and dispositioned?" without
-- the row itself. Append-only; a row survives the intelligence_items delete (no FK). Written BEFORE the guarded
-- delete (fail-closed: no tombstone, no delete).
create table if not exists public.disposition_ledger (
  id                       uuid primary key default gen_random_uuid(),
  intelligence_item_id     uuid,               -- the deleted item's id (soft ref; row is gone after delete)
  item_key                 text,               -- legacy_id / human key
  canonical_instrument_key text,               -- the instrument identity (the dedup join key)
  title                    text,
  source_url               text,
  archive_reason           text,
  disposition              text not null,      -- e.g. tombstone_delete_artifact | tombstone_delete_duplicate | merged_into
  merged_into_item_id      uuid,               -- for a duplicate merge: the surviving item
  snapshot_pointer         text,               -- raw_fetches file_path / source_id preserving the content, if any
  disposition_by           text,
  disposition_date         timestamptz not null default now()
);
comment on table public.disposition_ledger is
  'Tombstone ledger (operator amendment 2026-07-16). Permanent identity record of every archived item DELETED to reach zero-archived. Append-only, no FK (survives the item delete). Written BEFORE the guarded delete. Queryable at expansion/holdings-gate time by canonical_instrument_key to answer "already evaluated + dispositioned".';
create index if not exists idx_disposition_ledger_canonical on public.disposition_ledger (canonical_instrument_key);
