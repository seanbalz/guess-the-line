-- Hosting support only. No recurring job or credential is created here.
-- https://supabase.com/docs/guides/cron/install
-- https://supabase.com/docs/guides/database/extensions/pg_net
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
