# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project: Plural-Host

A private, self-hosted, API-compatible System Management Suite for a user with DID/OSDD-1.
Built as a Simply Plural replacement with "Privacy by Design" and "Crisis Management" features.

**Key design priorities (never compromise these):**
- Soft-delete only — rows are NEVER hard-deleted; always use `deleted_at` timestamp
- Ghost Mode — when `SystemSettings.IsFrozen = true`, ALL member/front/group queries return empty arrays (200 OK, not 404)
- Gatekeeper PIN — destructive actions require a secondary PIN separate from login password
- No public media URLs — all avatars/uploads behind auth

## Stack

- **Runtime:** .NET 8 / ASP.NET Core Web API
- **ORM:** EF Core 8 with SQLite provider
- **Testing:** xUnit + Moq + EF Core InMemory
- **Hashing:** BCrypt.Net-Next (work factor 12 for Gatekeeper PIN)
- **Containerization:** Docker + docker-compose

## Project Structure

```
PluralHost.sln
src/
  PluralHost.Api/
    Domain/          # ISoftDeletable, BaseEntity, Member, SystemSettings, AccessToken, FrontHistory, Group
    Data/            # PluralHostContext (EF Core DbContext with global filters)
    Services/        # IGhostModeService, IGatekeeperService, IShareTokenService
    Controllers/     # SecureActionController, ShareController
    BackgroundServices/  # AutoUnfreezeService
tests/
  PluralHost.Tests/
    Domain/
    Data/
    Services/
    Controllers/
docs/
  superpowers/plans/
    2026-03-11-plural-host-database-schema-crisis-shield.md  ← ACTIVE PLAN
```

## Build & Run Commands

```bash
# Build
dotnet build

# Run tests
dotnet test
dotnet test --filter "ClassName" -v minimal

# Run API locally
cd src/PluralHost.Api && dotnet run

# EF Core migrations
dotnet ef migrations add <Name> --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api

# Docker
docker compose build
docker compose up -d
docker compose down
```

## Current Status

**Active plan:** `docs/superpowers/plans/2026-03-11-plural-host-database-schema-crisis-shield.md`

**Execution status:** BLOCKED on Task 1 — .NET 8 SDK not yet installed on machine.

**Next action when resuming:**
1. Verify SDK: `dotnet --version` (should return 8.x.x)
2. If SDK confirmed, execute the plan using `superpowers:subagent-driven-development`
3. Start at Task 1: scaffold solution in `/c/dev/simply-personal`

**Tasks 1–14 are already created** in the task tracker (pending). Pick up from Task 1.

## Architecture Notes

### Ghost Mode (Critical)
EF Core `HasQueryFilter` applies TWO filters to Member, FrontHistory, Group:
1. `deleted_at IS NULL` — soft-delete filter
2. `!SystemSettings.IsFrozen` — Ghost Mode filter

This means Ghost Mode works automatically on every LINQ query. Never use `.IgnoreQueryFilters()` in production code paths.

### SystemSettings Singleton
Always `Id = 1`, seeded via `HasData`. Only one row ever exists. Reference it with `.FirstAsync()`.

### Gatekeeper PIN
BCrypt work factor 12. Stored in `SystemSettings.GatekeeperPinHash`. Separate from login password.
- Freezing = no PIN required (safe action)
- Unfreezing = PIN required (deliberate action)
- Any deletion = PIN required + 72h cooldown

### AccessTokens (Share Links)
- `TokenPermission.ReadFrontOnly` — only current fronter, no member details
- `TokenPermission.ReadOnly` — members (non-private) + current front
- Both return empty data when system is frozen, regardless of token validity

## Git

- Branch: `claude/init-project-setup-sO5k5`
- Remote: https://github.com/neurospicyexe/Simply_-Personal
