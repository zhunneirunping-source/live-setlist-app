# Data consistency and recovery

Updated: 2026-09-28

## Source-of-truth decision

Archive JSON under `初期移行データ/` is the single source of truth for runtime setlist data.

| Operation | Active data path |
| --- | --- |
| Read | Bundled archive JSON through `GET /api/setlists` |
| Create / Update / Delete | Disabled; API returns `405 Method Not Allowed` |
| Deploy | Validated archive JSON is bundled into the Worker artifact |
| Migration | Edit archive JSON locally, validate, review, then deploy with Human Approval |
| Backup | Git history plus an external backup of the repository/archive |

The browser has no local write fallback. D1 is not bound in `wrangler.jsonc` and is not reachable from the runtime route.

## Why archive JSON

The product is a personal, low-frequency, read/analysis application. It does not currently need Production editing. Keeping the already-rendered archive as the only runtime data store removes unauthenticated mutations and split-brain behavior without adding an authentication service or synchronization layer.

The legacy D1 database and local Drizzle schema are retained only for read-only comparison and possible future migration. They are not runtime authorities.

## Legacy D1 reconciliation gate

No Production data was changed by this remediation. Before the next Production deployment:

1. Export or query D1 read-only and back it up.
2. Compare setlists, ordered membership, and song metadata against the archive.
3. Resolve any D1-only intentional edits into reviewed archive JSON.
4. Re-run archive validation and the full application test/build suite.
5. Deploy only after Human Approval.

## Rollback plan

If a future read-only deployment regresses data or rendering, roll back the Worker deployment to the previous version. The legacy D1 database is unchanged, and the prior archive snapshot remains available in Git history. Do not restore D1 into runtime implicitly; any return to D1 requires a new architecture decision, authentication plan, and reviewed migration.

## Future editing UI

Reintroduce editing only when there is a concrete need. At that point, select one authenticated write workflow and move reads to the same authoritative store in the same release. Cloudflare Access is the preferred first option for a single-user operator surface; application authentication is justified only if Access cannot cover the actual interaction model.
