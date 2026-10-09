-- pg_net stores request headers in its queue. Keep all scheduler and Vault
-- objects private to administrators; Edge workers only use the narrow public RPCs.
revoke all on schema net,cron,vault from public,anon,authenticated,service_role;
revoke all on all tables in schema net,cron,vault from public,anon,authenticated,service_role;
revoke all on all sequences in schema net,cron,vault from public,anon,authenticated,service_role;
-- Vault cryptographic helpers are extension-owned; schema and object denial
-- protects them without modifying their privileged internal grants.
revoke all on all functions in schema net,cron from public,anon,authenticated,service_role;
grant usage on schema net,cron,vault to postgres;
grant all on all tables in schema net,cron,vault to postgres;
grant all on all sequences in schema net,cron,vault to postgres;
grant execute on all functions in schema net,cron to postgres;
