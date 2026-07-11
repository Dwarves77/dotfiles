-- Rollback for migration 195 (error_events).
-- Drops the first-party error-tracking table and everything hanging off it
-- (policies + indexes go with the table). Telemetry data is loss-tolerant by
-- design — this rollback destroys captured error groups; that is acceptable
-- for observability data and requires no backup gate.
--
-- After running this, also revert the consumer code (captureError lib,
-- /api/telemetry/error, /admin Runtime → Errors) or leave it — every write
-- path is fail-open and the read surface renders an honest empty state when
-- the table is absent.

DROP TABLE IF EXISTS error_events;
