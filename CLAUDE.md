# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project: Plural-Host

A private, self-hosted, API-compatible System Management Suite for a user with DID/OSDD-1.
Built as a Simply Plural replacement with "Privacy by Design" and "Crisis Management" features.

**Key design priorities (never compromise these):**
- Soft-delete only — rows are NEVER hard-deleted; always use `deleted_at` timestamp
- Ghost Mode — when `SystemSettings.IsFrozen = true`, ALL member/front/group queries return empty arrays (200 OK, not 404)
- Gatekeeper PIN — destructive actions require a secondary PIN separate from login password
- No public media URLs — all avatars/uploads served from `/secure_uploads/` behind auth only

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
    Domain/             # ISoftDeletable, BaseEntity, Member, SystemSettings, AccessToken, FrontHistory, Group
    Data/               # PluralHostContext (EF Core DbContext with global filters)
      Migrations/       # EF Core migration files (committed to repo)
    Services/           # IGhostModeService, IGatekeeperService, IShareTokenService
    Controllers/        # SecureActionController, ShareController
    BackgroundServices/ # AutoUnfreezeService
tests/
  PluralHost.Tests/
    Domain/             # BaseEntityTests, MemberTests, SystemSettingsTests, AccessTokenTests
    Data/               # SoftDeleteFilterTests, GhostModeFilterTests
    Services/           # GhostModeServiceTests, GatekeeperServiceTests, ShareTokenServiceTests
    Controllers/        # SecureActionControllerTests
docs/
  superpowers/plans/
    2026-03-11-plural-host-database-schema-crisis-shield.md  ← COMPLETED
```

## Build & Run Commands

```bash
# Build
dotnet build

# Run tests (42 tests, all passing)
dotnet test
dotnet test --filter "ClassName" -v minimal

# Run API locally
cd src/PluralHost.Api && dotnet run

# EF Core migrations
dotnet tool install --global dotnet-ef   # if not already installed
dotnet ef migrations add <Name> --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api

# Docker
docker compose build
docker compose up -d   # API available at http://localhost:8080
docker compose down
```

## Current Status

**Plan `2026-03-11-plural-host-database-schema-crisis-shield.md` — COMPLETE (all 14 tasks done)**

What's built:
- All 5 domain models with soft-delete (Member, SystemSettings, AccessToken, FrontHistory, Group)
- PluralHostContext with double global filter (soft-delete + Ghost Mode) on Member/FrontHistory/Group
- SQLite schema via EF Core migrations — auto-applied on startup
- GhostModeService (freeze/unfreeze/timer), GatekeeperService (BCrypt PIN)
- SecureActionController: `POST /api/secure/freeze|unfreeze|request-deletion`, `DELETE /api/secure/cancel-deletion`
- ShareTokenService + ShareController: `GET /share/{token}`
- AutoUnfreezeService background poll (every 5 min)
- Docker image builds and runs clean (`simply-personal-pluralhost:latest`)
- 42/42 tests passing

**Next plans to write (separate plans, in suggested order):**
1. Auth layer — JWT login, session management, `GET /media/{id}` secure file endpoint
2. Simply Plural API mirror — replicate SP v1 routes, JSON parity for MCP tools
3. Members & Fronting CRUD API — full REST for members, front history, groups
4. Visualization — React Flow mind map, 24h heatmaps, PWA shell

**Branch:** `claude/init-project-setup-sO5k5`
**Remote:** https://github.com/neurospicyexe/Simply_-Personal

## Architecture Notes

### Ghost Mode (Critical)
EF Core `HasQueryFilter` applies TWO filters to Member, FrontHistory, Group — combined into ONE expression per entity (EF Core silently discards the first if you call `HasQueryFilter` twice):

```csharp
.HasQueryFilter(m =>
    m.DeletedAt == null &&
    !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());
```

This means Ghost Mode works automatically on every LINQ query without touching controller code.
**Never use `.IgnoreQueryFilters()` in production code paths.** Only acceptable in admin-level revoke operations (e.g., `RevokeTokenAsync`) and tests.

### Soft Delete
All entities inheriting `BaseEntity` have `SoftDelete()` / `Restore()` methods. Both update `UpdatedAt`. The global filter enforces `deleted_at IS NULL` on every query automatically.

### SystemSettings Singleton
Always `Id = 1`, seeded via `HasData`. Only one row ever exists. Always reference with `.FirstAsync()`.

### Gatekeeper PIN
BCrypt work factor 12. Stored in `SystemSettings.GatekeeperPinHash`. Completely separate from login password.
- Freezing = **no PIN required** (emergency safe action — zero friction)
- Unfreezing = **PIN required** (deliberate action)
- Any deletion = **PIN required** + 72h cooldown stored in `SystemSettings.DeletionCooldownEnd`

### AccessTokens (Share Links)
Generated with `RandomNumberGenerator.GetBytes(32)` — cryptographically secure, URL-safe Base64.
- `TokenPermission.ReadFrontOnly` — only current fronter name/color, no member list
- `TokenPermission.ReadOnly` — public members (non-private) + current front
- Both return empty `[]` when system is frozen, regardless of token validity
- Ghost Mode check happens **before** permission check in ShareController

### Member.ParentIds
Stored as comma-separated GUIDs in SQLite. Has a `ValueComparer<List<Guid>>` configured in `PluralHostContext` to prevent spurious EF Core change-tracking warnings and unnecessary UPDATE statements.

### Docker
- SQLite database persisted via volume mount: `./data:/app/data`
- Secure uploads persisted via volume mount: `./secure_uploads:/app/secure_uploads`
- Connection string override via env var: `ConnectionStrings__Default=Data Source=/app/data/pluralhost.db`
- API port: `8080`
