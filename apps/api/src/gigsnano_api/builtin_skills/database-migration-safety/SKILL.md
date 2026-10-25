---
name: database-migration-safety
version: 1.0.0
description: Write an Alembic migration that cannot take the service down on deploy, and verify it actually applied.
---

# Database Migration Safety

**Use when:** a change adds or alters a table, column, index, constraint or enum.
**Not for:** data-only backfills that touch no schema (still verify, but the
DDL rules below do not apply).

## Why this is severe here
`entrypoint.sh` runs `alembic upgrade head` with `set -e`. A migration that
raises does not degrade the deploy — it stops the container from starting. A
green `/health` on the old revision looks identical to a successful deploy.

## Rules
1. **Create an enum exactly once.** `sa.Enum(...)` inside `create_table()` emits
   its own `CREATE TYPE`. If you also called `.create(bind)` beforehand, the
   second one raises `DuplicateObject` and the upgrade aborts. Pick one site:
   either `create_type=False` on the column, or no explicit `.create()`.
2. **Write the downgrade, and read it.** An unreviewed downgrade is how a
   rollback becomes a second outage.
3. **One head.** Check `alembic heads` before you write — a second head from a
   parallel branch fails on deploy, not locally. Trust `heads`, not a hand-read
   of the revision chain.
4. **A unique constraint must account for soft deletes.** Rows here are
   soft-deleted and filtered globally, so a "free" value may still exist in the
   table. Allocate past soft-deleted rows or scope the constraint — otherwise the
   first delete poisons every later insert.
5. **New nullable column, or a default + backfill.** `NOT NULL` with no default
   on a populated table fails at exactly the wrong moment.

## Verification (not optional)
- Run the migration against a real database, both directions: `upgrade head`
  then `downgrade -1` then `upgrade head` again.
- After deploy, confirm `alembic_version` advanced to the new revision. A
  passing `/health` proves the container is up, not that the schema moved.

## Evidence to attach
The upgrade/downgrade output, and the `alembic_version` value after deploy.
