-- D-59 fantasy feed: a private Storage bucket for the JSON that Sean's fantasy exporter publishes through the
-- machine-only gtl-fantasy-ingest function. No storage policy is added. With row level security on storage.objects,
-- anon and authenticated read and write nothing in this bucket; only service_role reaches it (gtl-fantasy-ingest
-- writes, gtl-api reads), and gtl-api decides what each signed-in player may see.
-- GTL had no Storage objects before this file, so it refuses to run if row level security is off on either storage
-- table or if any storage policy already exists, since a policy written for another bucket could also match this one.
do $$
begin
  if exists (select 1 from pg_class where oid in ('storage.objects'::regclass, 'storage.buckets'::regclass) and not relrowsecurity) then
    raise exception 'GTL_FANTASY_FEED_RLS: row level security is off on a storage table';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage') then
    raise exception 'GTL_FANTASY_FEED_POLICY: storage already has policies; review them before adding the bucket';
  end if;
end $$;

-- A plain insert: if the bucket already exists, the apply fails instead of keeping settings this file did not write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fantasy-feed', 'fantasy-feed', false, 10485760, array['application/json']);
