# Data consistency and recovery

Updated: 2026-09-29

## Source-of-truth decision

The released application has two non-overlapping authoritative domains.

| Data | Authority | Runtime role |
| --- | --- | --- |
| Historical 18-event Archive | `初期移行データ/*.json` | Read-only history and aggregation input |
| Mutable Planner | Cloudflare D1 `planner_state` | Event, lottery, performance, ordered track, playlist status |
| `live-setlist-planner:v1` | Migration source only | Empty-Cloud import or Human-reviewed additive import; never deleted automatically |
| React state / browser cache | Cache only | Never a durable authority |

D1 stores a versioned Planner document and monotonically increasing revision. Every update includes the last-read revision. A stale PC/Smartphone update receives `409` plus the latest document instead of silently overwriting another device.

## localStorage migration

1. Read Cloud Planner.
2. If Cloud is empty and valid local v1 data exists, submit an idempotent migration key and the document.
3. D1 writes the migration receipt and Planner document in one `batch` transaction.
4. The client accepts Cloud as authoritative only after the response confirms the stored document.
5. Duplicate keys are safe; failures keep localStorage unchanged.

When Cloud is already non-empty, an unrecorded local migration source is compared rather than ignored. Local-only records are shown as additive candidates; same-ID or same-canonical-song differences are conflicts. Human action may add candidates, but neither the client nor server may overwrite/delete existing Cloud records. The server validates the additive superset, revision, and optional migration receipt. Conflicts remain in localStorage for Human Review.

## Authentication boundary

Production uses Cloudflare Access on the entire Worker route space (`/*`) with an exact-owner identity policy. `/api/planner` also requires the Access-authenticated email header outside localhost. Header checking remains defense in depth; it is not a substitute for the edge policy.

Release verification on 2026-09-29 confirmed anonymous Access redirects for Root and both APIs, authenticated Planner reads/writes, stale revision `409`, reviewed local-only import, and cross-device synchronization.

## Archive classification and normalization

The 2026-09-29 Human Gate approved and applied Event Type classification to every Archive event: 14 `festival`, 4 `one_man`, and 0 `taiban`. UI labels are fixed to フェス / 単独 / 対バン.

The same gate approved display normalization for two already-shared normalized identities: five occurrences of `あつまれ！パーティーピーポー` and two occurrences of `Mr.Cosmo`. The normalization keys and identity behavior were not changed. `npm run data:audit` must continue to report 18 events / 813 tracks and no Human Review candidates.

Archive JSON remains the read-only authority. D1 migrations `0000` and `0001` create tables but do not import, rewrite, or delete Archive history.

## Rollback

- Code rollback: deploy the previous Worker version.
- Schema: migration `0001_cloud_planner.sql` is additive; do not drop the new tables during rollback.
- Data: restore from the pre-migration D1 export/Time Travel only after reviewing the target timestamp.
- localStorage: remains available as recovery evidence because automatic deletion is prohibited.
