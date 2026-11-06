# Cities Builder Nest — database backup and restore

## Why this is configured separately

The connected Supabase organization is currently on the **Free** plan. Supabase's current backup documentation states that automatic daily platform backups are included on Pro, Team, and Enterprise plans; Free projects should export their data regularly and keep off-site backups.

The repository includes a scheduled encrypted backup workflow. It is intentionally disabled until the repository backup credentials and encryption keys are configured. No production database password or encryption private key is stored in Git.

## One-time GitHub configuration

In **GitHub → cities-builder-nest → Settings → Secrets and variables → Actions**, add:

**Repository secrets**
- `CBNEST_DATABASE_URL`: the Supabase PostgreSQL **session pooler** connection string (port 5432) or a direct database connection string that is reachable from GitHub Actions. Use the database password from Supabase. Do not use the transaction pooler connection string for `pg_dump`.
- `CBNEST_BACKUP_AGE_IDENTITY`: the private age identity corresponding to the public recipient below. Keep this private and store a separate offline recovery copy.

**Repository variable**
- `CBNEST_BACKUP_AGE_RECIPIENT`: the public age recipient used to encrypt each backup.

Generate an age key pair on a trusted machine with `age-keygen`. Store the public `age1...` recipient as the repository variable and the complete private identity as the repository secret. Keep a separate offline copy of the private identity; without it, encrypted backups cannot be decrypted.

After all three values are saved, set repository variable:
- `CBNEST_BACKUPS_ENABLED=true`

The workflow then runs daily at 02:23 UTC and can also be started manually from **Actions → Encrypted database backup and restore verification → Run workflow**.

## What each run does

1. Starts an isolated local Supabase/PostgreSQL environment in the GitHub runner.
2. Exports the production database with `pg_dump` in PostgreSQL custom format.
3. Encrypts the dump with age before it is uploaded.
4. Decrypts it inside the runner and checks the archive directory.
5. Uploads only the encrypted archive as a GitHub Actions artifact, retained for 30 days.
6. Restores the decrypted dump into a separate local database and verifies that application tables exist.
7. Stops the isolated local Supabase environment.

The workflow never uploads a plaintext database dump. The artifact is encrypted; access to the age private identity and the database connection string must remain restricted.

## Recovery procedure

1. Download the encrypted artifact from a successful backup workflow run.
2. On a trusted machine with age and PostgreSQL client tools installed, decrypt it using the offline age identity:
   `age --decrypt --identity <private-identity-file> --output cbnest.dump cbnest-<timestamp>.dump.age`
3. Inspect the archive with `pg_restore --list cbnest.dump`.
4. Restore into a **separate recovery Supabase project or isolated PostgreSQL environment first**. Do not restore over the live production project during a routine test.
5. Validate tables, row counts, RLS policies, database functions, Auth dependencies, Storage objects, and application sign-in before considering the recovery usable.

A PostgreSQL database dump does not include files stored in Supabase Storage. Storage objects need a separate backup strategy. A restore test in the workflow validates the PostgreSQL dump and restore path in an isolated local Supabase environment; it does not restore Storage objects or prove a complete disaster recovery of Auth, Storage, DNS, API hosting, and secrets.

## Operational limits

- GitHub artifact retention is 30 days. This is a rolling backup window, not a long-term archive.
- Supabase Free does not provide the daily platform backup retention available on paid plans. Consider a paid Supabase plan or a separate encrypted object-storage destination for stronger retention and recovery objectives.
- Keep the database password and age private identity in GitHub Actions secrets only. Never put either in the repository, app environment files, mobile bundle, workflow logs, or chat.
- A successful backup workflow must be reviewed periodically; a green CI build alone is not a backup.
