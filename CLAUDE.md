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
    Domain/             # ISoftDeletable, BaseEntity, Member (PrivacyTier), SystemSettings, AccessToken, FrontHistory, Group, BoardMessage, MemberNote, FrontStatus
    Data/               # PluralHostContext (EF Core DbContext with global filters)
      Migrations/       # EF Core migration files (committed to repo)
    Services/           # IGhostModeService, IGatekeeperService, IShareTokenService, ITokenVisibilityService, IAuthService, IMemberService
    Controllers/        # SecureActionController, ShareController, TokensController, MembersController, BoardController, MemberNotesController, FrontStatusController, SpMembersController, SpFrontController, SpGroupsController, MediaController
    BackgroundServices/ # AutoUnfreezeService
    Dto/                # NativeDtos.cs, SpDtos.cs
tests/
  PluralHost.Tests/
    Domain/             # BaseEntityTests, MemberTests, SystemSettingsTests, AccessTokenTests
    Data/               # SoftDeleteFilterTests, GhostModeFilterTests
    Services/           # GhostModeServiceTests, GatekeeperServiceTests, ShareTokenServiceTests, TokenVisibilityServiceTests
    Controllers/        # SecureActionControllerTests, MembersControllerTests, SpMembersControllerTests, BoardControllerTests, TokensControllerTests, ShareControllerTests
docs/
  superpowers/
    plans/
      2026-03-11-plural-host-database-schema-crisis-shield.md  ← COMPLETED
      2026-03-14-plan2-privacy-tiers-share-tokens.md           ← COMPLETED
    specs/
      2026-03-14-plan2-share-tokens-privacy-tiers-design.md
```

## Build & Run Commands

```bash
# Build
dotnet build

# Run tests (183 passing, 3 pre-existing JWT stubs failing)
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

**Plan 1 `2026-03-11-plural-host-database-schema-crisis-shield.md` — COMPLETE**

- All 5 domain models, Ghost Mode, Gatekeeper PIN, share tokens, AutoUnfreezeService, Docker

**Auth layer (between Plan 1 and 2, no separate plan doc) — COMPLETE**

- JWT login (`POST /api/auth/login`, `POST /api/auth/change-password`)
- `[Authorize]` on all owner-side endpoints
- `MediaController` (`GET /api/media/{id}`) serving secure uploads behind auth
- SP v1 API mirror: members, front history, groups, system endpoints

**Plan 2 `2026-03-14-plan2-privacy-tiers-share-tokens.md` — COMPLETE (all 11 tasks done)**

What's built:
- `MemberPrivacy` enum (Public=0 / Friend=1 / Trusted=2 / Private=3) replacing `IsPrivate` bool
- `TokenPermission` upgraded: ReadFrontOnly=0 / Public=1 / Friend=2 / Trusted=3 (with data migration)
- `ITokenVisibilityService` — `FilterByPermission` (strict `<`) and `CanPostToBoard`
- `IShareTokenService` updated: discriminated `TokenResolveResult`, `bool`-returning revoke
- `GET/POST/DELETE /api/tokens` — owner token management (label, expiry, allowsBoardPosting)
- `POST /share/{token}/board/{memberId}` — token-holder board posting (Ghost Mode safe)
- Ghost Mode guard added to `BoardController.PostAsync`
- Ghost Mode ordering bug fixed in `ShareController` (now checks BEFORE token DB lookup)
- SP three-way `Private` write mapping (prevents silent Friend/Trusted tier downgrades)
- `BoardMessage.TokenId` nullable FK — traces which token posted each message
- 183/186 tests passing (3 pre-existing JWT stubs pending Plan 3)

**Next plans (spec: Plan 3 of 5 onwards):**
- Plan 3: Custom fields (programmable "Additional Info" tab) + Global journals
- Plan 4: Simply Plural / PluralKit import pipeline
- Plan 5: React Flow mind map, 24h heatmaps, PWA shell

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
**Never use `.IgnoreQueryFilters()` in production code paths.** Acceptable in:
- Admin-level revoke operations (e.g., `RevokeTokenAsync`) — needs to see revoked tokens
- `ShareController.PostToBoardAsync` member lookup — intentionally bypasses to distinguish 404 (deleted) from 403 (tier too high), Ghost Mode already checked at step 1
- Tests

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
- `TokenPermission.ReadFrontOnly` — only current Public-tier fronters, no member list
- `TokenPermission.Public` — Public-tier members + current Public-tier front
- `TokenPermission.Friend` — Public + Friend-tier members
- `TokenPermission.Trusted` — Public + Friend + Trusted-tier members
- All return empty `[]` / 204 when system is frozen, before any token DB lookup
- Ghost Mode check happens **before** `ResolveTokenAsync` in `ShareController` (both GET and POST)
- `TokenResolveResult` discriminated type: `Valid` / `NotFound` / `Revoked` / `Expired`
- `RevokeTokenAsync` returns `bool` (false = not found or already revoked, no throw)

### Privacy Tiers
`MemberPrivacy` enum: Public=0, Friend=1, Trusted=2, Private=3.
`TokenPermission` is offset +1 from `MemberPrivacy`. Visibility uses **strict less-than**:
`(int)member.PrivacyTier < (int)tokenPermission` — so Public(1) sees only Public(0), etc.
SP protocol maps `Private: true/false` using three-way logic in `SpMembersController`:
- `true` → always set `PrivacyTier = Private`
- `false` + currently Private → set `PrivacyTier = Public`
- `false` + currently Friend/Trusted → leave unchanged (SP has no intermediate tiers)

### Member.ParentIds
Stored as comma-separated GUIDs in SQLite. Has a `ValueComparer<List<Guid>>` configured in `PluralHostContext` to prevent spurious EF Core change-tracking warnings and unnecessary UPDATE statements.

### Docker
- SQLite database persisted via volume mount: `./data:/app/data`
- Secure uploads persisted via volume mount: `./secure_uploads:/app/secure_uploads`
- Connection string override via env var: `ConnectionStrings__Default=Data Source=/app/data/pluralhost.db`
- API port: `8080`
