# Guess The Line — recovery and release evidence

Owner: Sean Balsiger. Prepared by Codex, October 8, 2026. Status: local tools and
checks; no production restore, remote CI run or new release is claimed here.

## Local recovery

`scripts/local-recovery.mjs` supports the owner-only Node preview state, version 1.
It preserves ballots, submission timestamps, selected quotes, frozen references,
history (including D-16 consensus evidence) and audits as one private, hash-checked JSON envelope. It rejects unknown
versions, credential-shaped content and symbolic paths. On macOS/Linux, backups use
mode 0600 inside a 0700 directory. On Windows, built-in Windows PowerShell creates
the destination with a protected owner-only access-control list before writing;
backup and restored files inherit that access. Existing Windows destinations must
be owned by the current user, disable inherited grants and grant inheritable full
control to that user; only the user, SYSTEM and Administrators may have allow rules.
Shared destinations are rejected rather than having their permissions changed.
If PowerShell or filesystem ACL support is unavailable, recovery fails before
writing data. Windows `chmod` mode bits do not establish privacy; the implementation
uses [CreateDirectoryW security attributes](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createdirectoryw)
and reads the resulting ACL back. It checks the serialized envelope and restored state against
the 50 MiB limit before writing, then reads the backup back to verify it. It never
initializes missing state or contacts a service.

From the repository root, after the local preview has created its state file:

```sh
node scripts/local-recovery.mjs backup .local/state.json .local/backups
node scripts/local-recovery.mjs verify .local/backups/EXACT_BACKUP_FILENAME.json
node scripts/local-recovery.mjs restore-drill .local/backups/EXACT_BACKUP_FILENAME.json .local/restore-drill-NEW
```

Use the exact filename returned by backup. A drill requires a new destination;
existing directories or state files are never replaced. Verify the restored hash
before opening any isolated preview. Production files are not changed by a drill.
Use physical filesystem paths; symbolic aliases such as macOS `/var` may require
their real `/private/var` path.

Retention is manual: these commands neither expire nor delete snapshots. Choosing
cloud retention and recovery objectives remains OPS-02; no automatic policy is
implied. The envelope's SHA-256 detects accidental modification, not a malicious
party rewriting both state and digest. Keep copies in private trusted storage.

This is **not a hosted Supabase backup**. It excludes Auth identities, remote
memberships, canonical weekly tables, provider state and hosted service secrets.
Player audit export also cannot restore the whole hosted application. A complete
hosted recovery needs a private export design, separately handled Auth/service
configuration, approved retention and an isolated database restore demonstration.
Never put credentials or cloud backup data in a public build or repository commit.

## Release checks and artifact fingerprints

```sh
npm test
npm run test:browser
npm run test:cloud-browser
python3 scripts/snapshots.py check
python3 -m unittest discover -s tests -v
npm run build:cloud
node scripts/check-cloud-boundary.mjs --bundle-only
node scripts/release-manifest.mjs
git diff --check
```

The release manifest stays in ignored `.local/release-manifest.json`. It records
the Node version, Git base and dirty state, dependency lock, exact local source,
migration and compiled-asset hashes, including the non-secret Supabase gateway and
Wrangler deployment configurations. `deployed: false` is deliberate: a build
fingerprint proves neither tests nor publication. Record the checks actually run
with their date and exit result in the tracker. The CI workflow now builds and
scans an authenticated frontend using example publishable configuration; actual
remote execution still needs a published repository revision. The current local build verification
uses example publishable configuration, matching CI. An authorized production
release must build with its intended public configuration and repeat the scan
and manifest capture; this test artifact is not a production deployment.

Before an authorized release, preserve the last known production Pages deployment
and API version and their matching source/migration manifest. Apply additive schema
changes before compatible API/client changes; validate the matched set in isolation.
Do not replace the database or historical state to roll back a frontend. A rollback
must first establish that the earlier API works against the current additive schema.
No tested hosted rollback or remote CI execution is claimed by this runbook.

## Live operational readback, October 8 at 22:44 UTC

Read-only connector evidence: project `onmrgvcehkflfaizvedl` reports
`ACTIVE_HEALTHY`. The Week 5 collector remains enabled, with active 08:15/20:15 UTC
cron. Only its October 8 20:21 UTC dispatcher run is present and succeeded; this
does not demonstrate a clock-triggered run. The next scheduled boundary is October
9 at 08:15 UTC. No extra collection was triggered and no provider quota was spent.

The security advisor still reports the platform-owned `pg_net` extension placement
and disabled leaked-password protection. See the official remediation guidance for
[extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Nineteen application tables have RLS with no browser policies by design: browser
privileges are revoked and access goes through the authenticated server. An advisor
entry alone is not a reason to grant browser access. No destructive extension
reinstall, password-policy change or paid plan change was performed.

Remaining physical verification: a real second device, actual simultaneous
database edits, phone performance and delivery on chosen channels. Browser fixtures
and a serialized embedded PostgreSQL test cannot stand in for those observations.
