# Data consistency and recovery

Updated: 2026-09-28

## Current behavior

- Archive JSON is bundled into the application. Because the archive exists, `GET /api/setlists` currently returns archive data even when D1 is available.
- `POST`, `PUT`, and `DELETE` write to D1. They do not update archive JSON.
- The browser updates its in-memory view from a successful write response, but a reload reads the archive again. A D1 write can therefore appear successful and then disappear from the visible archive-backed view.
- localStorage is a best-effort recovery cache, not a source of truth. It now uses a versioned envelope, accepts the legacy array shape, salvages valid partial rows, and ignores malformed/unsupported values without blocking startup.

This is a split read/write model, not a reliable dual-write model. It can drift by design.

## PUT transaction boundary

Reordering has two non-transactional phases: update song rows, then update `setlist_songs.position`. A rejection during either `Promise.all` can leave some writes applied. Payload validation now runs before writes, and automated tests capture first-phase failure, second-phase partial failure, and convergent retry behavior. There is still no atomic rollback.

Until the architecture is changed:

1. Treat a 500 response as potentially partially applied.
2. Reload the D1 representation before retrying when an operator has a D1-specific inspection path.
3. Retry the complete desired ordering; updates are intended to converge to the submitted positions.
4. If state remains inconsistent, stop writes and compare song IDs plus `setlist_songs.position` before manual repair.

## Human decision required

The runtime source of truth must be chosen before changing the read path or adding dual writes:

- D1 as runtime source of truth, with archive JSON retained as immutable import/seed history.
- Archive JSON as source of truth, which requires writes to be disabled or converted into an explicit archive-generation workflow.
- Deliberate synchronization, which requires conflict rules, transaction/retry semantics, ownership, and drift monitoring.

The first option is operationally simplest, but selecting it changes product behavior and is not decided by this maintenance loop. Production migration, data reconciliation, and switching the GET path remain Human Approval gates.

## Drift checks before a future switch

- Compare setlist IDs and stable song identifiers between archive and D1.
- Compare ordered membership separately from song metadata.
- Decide how archive-only, D1-only, duplicate, and edited rows are resolved.
- Back up D1 and preserve the archive snapshot used for reconciliation.
- Run read-only comparison first; do not repair Production as part of the audit.
