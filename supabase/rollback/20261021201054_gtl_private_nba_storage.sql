-- Seal access without deleting imports, tickets, source records or result evidence.
revoke all on schema nba_private from public, anon, authenticated, service_role;
revoke all on all tables in schema nba_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema nba_private from public, anon, authenticated, service_role;
revoke all on all functions in schema nba_private from public, anon, authenticated, service_role;
