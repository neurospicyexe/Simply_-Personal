---
name: db-migration
description: Scaffold a new EF Core migration for PluralHost. Accepts migration name as argument. Runs dotnet ef, warns when a two-migration strategy is needed, and dispatches ef-migration-reviewer after generation.
disable-model-invocation: true
---

Run the following command to scaffold the migration:

```bash
cd /c/dev/simply-personal && dotnet ef migrations add $ARGS --project src/PluralHost.Api --output-dir Data/Migrations
```

After the command completes:

1. Print the generated migration filename.

2. Read the generated migration file and check for any of the following — if found, print a WARNING block:
   - `DropColumn` — Two-migration strategy required. Migration 1: add new column + UPDATE to copy data. Migration 2 (separate): drop old column.
   - `AddColumn` with `nullable: false` and no `defaultValue` — Needs a default value or prior UPDATE backfill, or it will fail on existing SQLite rows.
   - Changes to `Member`, `FrontHistory`, or `Group` table schema — Verify `HasQueryFilter` in `PluralHostContext.cs` is still intact after this change.

3. Dispatch the `ef-migration-reviewer` subagent against the new migration file to perform a full safety review.

4. Print the next step: `dotnet ef database update --project src/PluralHost.Api`
