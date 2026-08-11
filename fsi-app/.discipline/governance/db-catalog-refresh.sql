-- DB CATALOG REFRESH — regenerates fsi-app/.discipline/governance/db-catalog.json.
--
-- READ-ONLY BY CONSTRUCTION. Every statement below reads pg_catalog / pg_get_*def() only. It reads no
-- application row, writes nothing, creates nothing, and makes no network call. Running it costs one
-- round trip. It is NOT scheduled and must never be: the snapshot is refreshed deliberately, by a human
-- or an operator-run step, when the schema is believed to have changed.
--
-- WHY A COMMITTED SNAPSHOT RATHER THAN A LIVE CHECK. The always-on lanes (pre-push meta-gate, the no-npm
-- proof suite, the fitness runner) hold no database credentials on purpose — a gate that needs a secret
-- is a gate that cannot run on a fork PR and does not run at all when the secret expires. The database
-- side therefore enters the repo as a committed fact-file, and F24 (db-object-migration-home) holds that
-- file against the migration tree with pure filesystem reads. The credentialed step is the REFRESH, not
-- the CHECK.
--
-- WHAT THE SNAPSHOT'S STALENESS CAN AND CANNOT HIDE — stated plainly rather than papered over. DDL applied
-- out-of-repo AFTER the last refresh is invisible to F24 until someone refreshes. F24 closes the class
-- "out-of-repo DDL survives in the tree unexplained"; it does not, and cannot, detect out-of-repo DDL in
-- real time from a secret-less job. Detecting it live requires a credentialed lane; that is a separate
-- decision with a separate cost, and it is named as a residual in
-- docs/audits/db-layer-census-2026-08-11.md rather than implied to be covered.
--
-- USAGE: run each query, drop the results into the matching key of db-catalog.json, update capturedAt,
-- and commit. Any object that appears without a defining migration REDs F24 until it is given a migration
-- home or an explicit reason-bearing entry in F24's NO_MIGRATION_HOME list.

-- 1. counts (-> "counts")
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v') as views,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) as triggers,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i') as indexes,
  (select count(*) from cron.job) as cron_jobs;

-- 2. tables (-> "tables")
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;

-- 3. views (-> "views")
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') order by 1;

-- 4. functions, split by whether they are trigger functions (-> "rpcFunctions" / "triggerFunctions").
-- Extension-owned functions (pg_trgm, pgcrypto, …) are excluded via pg_depend deptype='e': they are
-- installed, not authored, and demanding a migration home for them would be noise.
select p.proname, (pg_get_function_result(p.oid) = 'trigger') as is_trigger_fn
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
order by is_trigger_fn, p.proname;

-- 5. extensions (-> "extensions"). Recorded because two of them are capabilities, not conveniences:
-- pg_cron can schedule work and pg_net can make outbound HTTP calls, both from inside the database and
-- therefore outside every repo-side gate. cron_jobs above is the live count for the first.
select extname from pg_extension order by 1;

-- 6. DB-INTERNAL BROKEN REFERENCES (-> "internalBrokenRefs"). Function/view/policy bodies that name a
-- public.<relation> which no longer exists — the class produced when a cleanup migration drops a table
-- and leaves its API behind. Run this, then subtract the names in "tables"/"views"/"rpcFunctions"/
-- "triggerFunctions"; whatever remains is broken. (Done as a subtraction rather than a single clever
-- query because the false-positive cost of guessing at identifier context inside function bodies is
-- higher than the cost of one extra step.)
select 'fn:'||p.proname as owner, pg_get_functiondef(p.oid) as body
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'view:'||c.relname, pg_get_viewdef(c.oid, true)
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')
union all
select 'policy:'||tablename, coalesce(qual,'')||' '||coalesce(with_check,'')
from pg_policies where schemaname='public';

-- 7. DATABASE-ORIGINATED EGRESS (-> "netCallers"). Functions whose body calls net.http_* (pg_net). This path
-- reaches the network from inside Postgres without passing through application code, so F15 (spend
-- chokepoint) and F16 (transport hold) cannot see it. prokind='f' matters: pg_get_functiondef() errors on an
-- aggregate, so an unfiltered scan of public fails outright rather than returning a wrong answer.
select distinct p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and pg_get_functiondef(p.oid) ~ 'net\.http_'
order by 1;

-- 8. WORK SCHEDULED INSIDE THE DATABASE (-> "cronJobs"). A pg_cron job runs on a clock no repo file records
-- and no workflow list shows. EMPTY is the correct state; any row must be sanctioned in F24's CRON_SANCTIONED.
select jobname, schedule from cron.job order by jobid;
