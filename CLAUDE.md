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
    Domain/             # ISoftDeletable, BaseEntity, Member (PrivacyTier), SystemSettings, AccessToken, FrontHistory, Group, BoardMessage, MemberNote, FrontStatus, CustomField, CustomFieldValue, JournalEntry, MemberRelationship
    Data/               # PluralHostContext (EF Core DbContext with global filters)
      Migrations/       # EF Core migration files (committed to repo)
    Services/           # IGhostModeService, IGatekeeperService, IShareTokenService, ITokenVisibilityService, IAuthService, IMemberService
    Controllers/        # SecureActionController, ShareController, TokensController, MembersController, BoardController, MemberNotesController, FrontStatusController, SpMembersController, SpFrontController, SpGroupsController, MediaController, FieldsController, MemberFieldsController, JournalsController, MemberRelationshipsController, ImportController
                        # SecureActionController also has GET /api/secure/status + PUT /api/secure/pin
    BackgroundServices/ # AutoUnfreezeService
    Dto/                # NativeDtos.cs, SpDtos.cs
  PluralHost.Web/       # React PWA (Vite + TypeScript, port 5173 in dev)
    src/
      api/              # apiFetch client + per-domain modules (auth, members, front, groups, notes, board, fields, media, secure, relationships, frontStatuses, tokens, journals, buckets, import)
      components/       # Avatar, BottomNav, FrontCard, MemberCard, TabBar, CreateMemberSheet, BottomSheet, HeatmapStrip, FrontHeatmap
        SystemMap/      # SystemMap, MemberNode, GroupNode, RelationshipEdge, NewRelationshipSheet (+ CSS modules)
        tabs/           # EssenceTab, SpecsTab, DossierTab, CommsTab, LogsTab, AccessTab (+ CSS modules)
      context/          # AuthContext (isAuthenticated, logout)
      pages/            # LoginPage, FrontPage, MembersPage, MemberDetailPage, HistoryStubPage, SettingsPage
      styles/           # tokens.css (design system), globals.css
      types.ts          # Member, Group, FrontContent, SpEnvelope, payload types
    vite.config.ts      # Proxies /api + /v1 → http://localhost:8080
tests/
  PluralHost.Tests/
    Domain/             # BaseEntityTests, MemberTests, SystemSettingsTests, AccessTokenTests
    Data/               # SoftDeleteFilterTests, GhostModeFilterTests
    Services/           # GhostModeServiceTests, GatekeeperServiceTests, ShareTokenServiceTests, TokenVisibilityServiceTests
    Controllers/        # SecureActionControllerTests, MembersControllerTests, SpMembersControllerTests, BoardControllerTests, TokensControllerTests, ShareControllerTests, FieldsControllerTests, MemberFieldsControllerTests, JournalsControllerTests
docs/
  cypher-notes.md       # Running session notes (auth quirks, dev setup, API notes)
  reference/
    simply-plural-ui.md # SP UI reference — what to keep, improve, and avoid
  superpowers/
    plans/
      2026-03-11-plural-host-database-schema-crisis-shield.md  ← COMPLETED
      2026-03-14-plan2-privacy-tiers-share-tokens.md           ← COMPLETED
      2026-03-15-plan3-custom-fields-journals.md               ← COMPLETED
      2026-03-17-plan5-pwa-shell.md                            ← COMPLETED
    specs/
      2026-03-14-plan2-share-tokens-privacy-tiers-design.md
      2026-03-15-plan3-custom-fields-journals.md
      2026-03-16-plan5-pwa-shell.md
```

## Build & Run Commands

```bash
# Backend — build + test
dotnet build
dotnet test
dotnet test --filter "ClassName" -v minimal

# Backend — run API locally (port 8080)
cd src/PluralHost.Api && dotnet run

# Frontend — dev server (port 5173, proxies /api + /v1 to :8080)
cd src/PluralHost.Web && npm run dev
cd src/PluralHost.Web && npx vitest run   # frontend tests

# First-time setup: set the login password (LoginPasswordHash starts null)
# Run once after first docker compose up or dotnet run:
# POST http://localhost:8080/api/auth/setup  { "password": "your-password" }

# EF Core migrations
dotnet tool install --global dotnet-ef   # if not already installed
dotnet ef migrations add <Name> --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api

# Docker (API only — frontend runs locally via npm run dev)
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

**Plan 2 `2026-03-14-plan2-privacy-tiers-share-tokens.md` — COMPLETE**

- `MemberPrivacy` enum (Public=0 / Friend=1 / Trusted=2 / Private=3) replacing `IsPrivate` bool
- `TokenPermission` upgraded: ReadFrontOnly=0 / Public=1 / Friend=2 / Trusted=3 (with data migration)
- `ITokenVisibilityService` — `FilterByPermission` (strict `<`) and `CanPostToBoard`
- `GET/POST/DELETE /api/tokens`, `POST /share/{token}/board/{memberId}`, Ghost Mode fixes

**Plan 3 `2026-03-15-plan3-custom-fields-journals.md` — COMPLETE (2026-03-15)**

- JWT fix: `AuthService.GenerateTokenAsync` implemented (HS256, sub/jti/iat, configurable expiry)
- `CustomField`, `CustomFieldValue`, `JournalEntry` entities — soft-delete-only `HasQueryFilter`
- EF Core migration: 3 new tables, unique index on `(FieldId, MemberId)`
- `FieldsController` — GET/POST/PATCH/DELETE `/api/fields` (owner, includes soft-deleted in GET)
- `MemberFieldsController` — GET/PUT/DELETE `/api/members/{id}/fields` with upsert+restore pattern
- `JournalsController` — GET/POST/PATCH/DELETE `/api/journals` (500-entry safety limit)
- Share: `customFields` array per member in `GET /share/{token}` with inline privacy-tier filter
- `GET /share/{token}/journals` — Ghost Mode → 401 → ReadFrontOnly 403 → public entries only
- 229/229 tests passing

**Plan 4 — skipped for now** (SP/PluralKit import pipeline — deferred until core UI is solid)

**Plan 5 `2026-03-16-plan5-pwa-shell.md` — COMPLETE (2026-03-17)**

- Vite + React + TypeScript PWA, served separately from the API (port 5173 in dev)
- Cookie-based auth (`httpOnly + Secure + SameSite=Strict`, 30-day expiry)
- CORS configured for dev (`localhost:5173`) — `credentials: include` on all fetches
- TanStack Query for all data fetching; Front screen polls every 30s
- Pages: Login, Front, Members, MemberDetail, History (stub), Settings
- Components: Avatar, BottomNav, FrontCard, MemberCard, TabBar
- Design system: dark theme, `--color-primary: #b6ff00` (lime), CSS Modules throughout
- Inline editable fields on MemberDetail Profile tab; Options tab privacy/toggle controls
- PWA manifest + SVG icons + Lucide icons in BottomNav

**Ad-hoc additions (2026-03-18, beyond Plan 5):**
- `CreateMemberSheet` — bottom sheet for adding members (name, display name, pronouns, color picker)
  - `POST /api/members` wired up; invalidates `['members']` query on success
- `docs/cypher-notes.md` — running session notes file

**Plan 6a `2026-03-21-plan6a-member-detail-tabs.md` — COMPLETE (2026-03-21)**

- `BottomSheet` shared component (`src/components/BottomSheet.tsx`) + `useReducedMotion` hook
- **EssenceTab** — bio, pronouns, description, color display (no upload yet)
- **SpecsTab** — custom fields UI (add from presets or define own; GET/POST/DELETE `/api/fields`, GET/PUT/DELETE `/api/members/:id/fields`)
- **DossierTab** — member notes (GET/POST/DELETE `/api/members/:id/notes`)
- **CommsTab** — board messages filtered by member (GET/POST `/api/board`)
- **LogsTab** — front history (GET `/api/front/history`)
- **AccessTab** — privacy tier selector, group chips, group membership toggle
- `MemberDetailPage` wired up: 6-tab layout, each tab as standalone component
- `api/notes.ts`, `api/board.ts`, `api/fields.ts`, `api/groups.ts` — new domain modules
- 278 backend / 49 frontend tests passing

**Plan 6b `2026-03-21-plan6b-avatar-delete-security.md` — COMPLETE (2026-03-22)**

- `POST /api/media/upload` — multipart upload, magic byte validation, UUID filenames, 5MB limit
- `DELETE /api/members/{id}` — soft-delete gated by Gatekeeper PIN + 72h system-wide cooldown (`SystemSettings.DeletionCooldownEnd`)
- `GET /api/secure/status` — returns `{ pinIsSet, deletionCooldownEnd }`
- `PUT /api/secure/pin` — set or change Gatekeeper PIN (BCrypt wf=12)
- `AvatarPath` added to `MemberUpdateRequest` DTO and `PATCH /api/members/{id}` handler
- **EssenceTab** — avatar circle with pencil button overlay; upload flow with preview + error revert
- **AccessTab** — Danger Zone section: delete button, PIN confirmation sheet, 60s cooldown countdown, auto-transition when cooldown expires
- **SettingsPage** — collapsible Security section: Change Password form + Gatekeeper PIN form
- `api/media.ts`, `api/secure.ts` — new frontend modules
- 278 backend / 52 frontend tests passing

**Plan 7a `2026-03-22-plan7a-frontend-repair.md` — COMPLETE (2026-03-22)**

- **SpecsTab fixed** — `FieldDef`/`MemberFieldEntry` types aligned with backend DTOs (`name`→`label`, added `fieldType: number`, `sortOrder`, `privacyTier`); `fields.ts` `createDef` now sends `{label, fieldType: 0}` instead of `{name}` (was always 400)
- **Board delete fixed** — removed PIN requirement from `BoardController.DeleteAsync` (was always 403); `BoardControllerTests` updated
- **AccessTab checkboxes** — `.checkboxField` row layout; label and checkbox now on same line with `htmlFor` wiring
- **Avatar pencil** — 28px → 20px; Lucide `Pencil` icon replaces emoji
- **Add buttons** — Lucide `Plus size={16}` replaces typographic `+` in SpecsTab, CommsTab, DossierTab
- **Color token** — `--color-danger: #f87171` added to `tokens.css`; `AccessTab` fallback now resolves to token
- **Settings UX** — Security section opens by default (was collapsed, obscuring PIN setup for new users)
- 278 backend / 52 frontend tests passing

**Plan 7b `2026-03-22-plan7b-groups-buckets.md` — COMPLETE (2026-03-22)**

- `PrivacyBucket` entity replaces `MemberPrivacy` enum — 4 seeded defaults + user-created custom buckets
- Two EF Core migrations: `AddPrivacyBuckets` (additive) + `CleanupLegacyPrivacyColumns` (destructive)
- `BucketsController` — GET/POST/PUT/DELETE/reorder `/api/buckets`; defaults protected from deletion
- `GroupsController` — native groups CRUD + `POST /api/groups/{id}/members` atomic batch assignment
- `TokenVisibilityService` updated: `MinBucketSortOrder` int replaces `TokenPermission` enum; `<=` comparison
- **System** page (5th nav entry) with Groups and Buckets tabs + MemberPickerList shared component
- `GroupSheet` / `BucketSheet` bottom sheets with live member picker + color/emoji editing
- `AccessTab` privacy selector now fetches live buckets from API (replaces hardcoded 4-tier segmented control)
- 291 backend / 52 frontend tests passing

**Plan 8a `2026-03-28-plan8a-front-statuses-field-def-management.md` — COMPLETE (2026-03-28)**

- `FrontStatusController` — GET/POST/PATCH/DELETE `/api/front/statuses`; `IsDefault` flag with unique-one-default enforcement
- **Statuses tab** on SystemPage — list all front statuses, `FrontStatusSheet` bottom sheet for create/edit/hide/delete
- **SpecsTab field def edit/delete** — `···` menu on each field row; inline rename via `PATCH /api/fields/:id`; delete via existing endpoint
- `frontStatuses.ts` API module; `fields.ts` updated with `updateDef`/`deleteDef`
- 295 backend / 87 frontend tests passing

**Plan 9 `2026-03-28-plan9-import-pipeline.md` — COMPLETE (2026-03-28)**

- `ImportController` — `POST /api/import/simply-plural` + `POST /api/import/plural-kit` (both `[Authorize]`)
- `ImportService` — 5 conflict strategies (MergePreferExisting / Overwrite / Skip / MergePreferImported / Duplicate), custom field upsert, front history dedup
- `AvatarDownloadService` — SSRF-safe download; private IP blocks; magic byte validation (JPEG/PNG/GIF/WebP); 5MB limit; saves to `secure_uploads/`
- `PluralKitClient` — live pull from `https://api.pluralkit.me/v2`; paginated switches (cursor `?before=`, up to 10 pages); token never stored
- `ImportDtos.cs` — flat SP format (`_id` at root, no `content` wrapper); all DTO types for SP + PK
- SP JSON upload + PK token card in SettingsPage with conflict strategy selector + result card
- 295 backend / 87 frontend tests passing

**Plan 10 `2026-03-28-plan10-front-heatmap.md` — COMPLETE (2026-03-28)**

- `GET /v1/frontHistory` gains optional `?from`/`?to` date-range filtering (overlap semantics)
- `HeatmapStrip` — compact 24h swimlane on FrontPage, top 5 by front time, "Full view →" deep-links to `/logs?tab=heatmap`
- `FrontHeatmap` — full view, 24h/7d/30d toggle, active members sorted by front time, inactive dimmed, auto-refetches 30s
- LogsPage: Heatmap as 3rd tab, `useState` → `useSearchParams` deep-link
- 299 backend / 92 frontend tests passing

**System Map `2026-03-28` — COMPLETE**

- `MemberRelationship` entity — soft-delete + Ghost Mode filter, self-relationship guard, label max 100, FK both sides `NoAction`
- `MemberRelationshipsController` — GET/POST/PATCH/DELETE `/api/members/relationships`, all `[Authorize]`
- `@xyflow/react` v12 + `d3-force` installed
- `MemberNode` / `GroupNode` / `RelationshipEdge` / `NewRelationshipSheet` / `SystemMap` components
- `SystemMap` — d3-force sync layout, Groups/Relationships/Both mode chips, drag-to-connect via `onConnect`
- `MembersPage` — 'map' ViewMode added, List/Folder/Map toggle
- `DossierTab` — Connections section (list, member picker → NewRelationshipSheet, delete with confirm)
- 309 backend / 107 frontend tests passing

**Next — Future Work:**
- Per-alter theming (background, accent color)

**SP UI Alignment (reference: `docs/reference/simply-plural-ui.md`):**
- Goal: all of SP's features, but actually beautiful and desktop-first-responsive
- Do NOT replicate: mobile-only layout, thin left-edge color bars, alter-by-alter bucket assignment
- DO improve on: member color usage (let it breathe), bucket-to-alters assignment direction, per-alter theming, desktop sidebar/panel layout alongside mobile-first responsive
- SP member profile has 6 tabs (Groups / Profile / Board / History / Notes / Options) — we now have all 6 equivalent tabs implemented

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
- `FieldsController.GetAllAsync` — owner needs to see soft-deleted field definitions
- `FieldsController.DeleteAsync` / `MemberFieldsController.UpsertAsync` — must find soft-deleted rows due to unique constraint on `(FieldId, MemberId)` covering deleted rows
- Tests

**`MemberRelationship` also has Ghost Mode filter** — combined single `HasQueryFilter` (same pattern as `MemberNote`). Relationships return empty when system is frozen.

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

### Privacy Buckets (Plan 7b — replaces MemberPrivacy enum)
`PrivacyBucket` is a first-class entity. Four seeded defaults with fixed GUIDs:
- `PrivacyBucket.PublicId`  = `00000000-0000-0000-0000-000000000001` (SortOrder 0)
- `PrivacyBucket.FriendId`  = `00000000-0000-0000-0000-000000000002` (SortOrder 1)
- `PrivacyBucket.TrustedId` = `00000000-0000-0000-0000-000000000003` (SortOrder 2)
- `PrivacyBucket.PrivateId` = `00000000-0000-0000-0000-000000000004` (SortOrder 3)

`AccessToken.MinBucketSortOrder` replaces `Permission` enum. Mapping: ReadFrontOnly=-1, Public=0, Friend=1, Trusted=2.
Visibility uses **less-than-or-equal**: `member.Bucket.SortOrder <= token.MinBucketSortOrder`
`ReadFrontOnly` (`MinBucketSortOrder = -1`) throws if passed to `FilterByPermission` — guard intentional.
Buckets are owner-only admin data — **Ghost Mode filter NOT applied** to `PrivacyBuckets` DbSet (soft-delete only).
`PUBLIC_BUCKET_ID` exported from `api/buckets.ts` — always import, never hardcode.

SP protocol maps `Private: true/false` via `SpMembersController`:
- `true` → `BucketId = PrivacyBucket.PrivateId`
- `false` + currently Private → `BucketId = PrivacyBucket.PublicId`
- `false` + currently non-Private → leave unchanged

### Member.ParentIds
Stored as comma-separated GUIDs in SQLite. Has a `ValueComparer<List<Guid>>` configured in `PluralHostContext` to prevent spurious EF Core change-tracking warnings and unnecessary UPDATE statements.

### Docker
- SQLite database persisted via volume mount: `./data:/app/data`
- Secure uploads persisted via volume mount: `./secure_uploads:/app/secure_uploads`
- Connection string override via env var: `ConnectionStrings__Default=Data Source=/app/data/pluralhost.db`
- API port: `8080`

## Known Security Issues (Pending Fix)

Reviewed 2026-03-15. Items ordered by severity.

### HIGH — Gatekeeper PIN in Query String
`DELETE /api/tokens/{tokenValue}?pin=...` passes the PIN in the URL. Query strings appear in server access logs, nginx logs, browser history, and `Referer` headers.
**Fix:** Move to request body using the existing `PinRequest` record (`[FromBody] PinRequest body`).
**Location:** `TokensController.cs:45`

### MEDIUM — No HTTPS Enforcement in Application
`Program.cs` does not call `UseHttpsRedirection()`. JWT tokens, passwords, and the PIN query string travel plaintext if a client connects over HTTP. Relies entirely on the reverse proxy being correctly configured.
**Fix:** Add `app.UseHttpsRedirection()` before `UseAuthentication()`. Document TLS requirement in docker-compose comments.

### MEDIUM — Unauthenticated Freeze Endpoint Has No Rate Limit
`POST /api/secure/freeze` is `[AllowAnonymous]` (intentional — crisis safety). Without rate limiting, any IP can call it repeatedly to keep the system permanently frozen (DoS against the owner).
**Fix:** Apply a rate limiter (e.g. 5 req/min per IP) via ASP.NET Core rate limiting middleware.
**Location:** `SecureActionController.cs:20`

### MEDIUM — No Brute-Force Protection on Login
`POST /api/auth/login` has no rate limiting. BCrypt wf=12 alone (~250ms/check) is insufficient — sustained dictionary attacks can proceed at ~240 attempts/minute.
**Fix:** Apply rate limiting (10 attempts/min per IP with back-off).

### LOW — `IsFrozenAsync` Ignores `FreezeEndDate` Expiry
`GhostModeService.IsFrozenAsync()` returns `settings.IsFrozen` without checking if `FreezeEndDate` has already passed. The `AutoUnfreezeService` polls every 5 minutes, so data can stay hidden up to 5 minutes after a timed freeze should have lifted.
**Fix:** `return settings.IsFrozen && (settings.FreezeEndDate == null || settings.FreezeEndDate > DateTime.UtcNow);`
**Location:** `GhostModeService.cs:37`

### LOW — Integer Overflow on Extreme `DurationHours`
`TimeSpan.FromHours(int.MaxValue)` throws `OverflowException` → HTTP 500. `POST /api/secure/freeze` is `[AllowAnonymous]`, so this requires no auth to trigger.
**Fix:** Validate `DurationHours` is between 1 and 8760 before use.
**Location:** `SecureActionController.cs:23`

### MEDIUM — No Security Response Headers
`Program.cs` configures no security headers. Every response is missing HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy.
**Fix:** Add middleware to `Program.cs` before `UseAuthentication()`:
```csharp
app.Use(async (ctx, next) => {
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});
```
Or install `NWebsec.AspNetCore.Middleware` for a cleaner API.

### LOW — MediaController Serves Files Without `Content-Disposition: attachment`
`PhysicalFile(resolved, contentType)` lets the browser render the file inline. Once a file-upload endpoint exists (Plan 3/5), an attacker who uploads an HTML or SVG file to `secure_uploads` could achieve stored XSS — the file renders in the owner's authenticated browser session.
**Fix:** Always force download:
```csharp
return PhysicalFile(resolved, contentType, Path.GetFileName(resolved));
// or explicitly:
Response.Headers["Content-Disposition"] = "attachment";
```
**Location:** `MediaController.cs:37`

### INFO — File Upload (Plan 3/5): Must Validate Magic Bytes + Use UUID Filenames
When adding file upload, the original filename must be discarded (use UUID + preserved extension). Validate both file extension (allowlist: jpg/png/gif/webp) AND magic bytes (first 4–8 bytes). Never rely on extension alone — rename + validate at the content level.

### INFO — JWT Must Go in httpOnly Cookies When Frontend is Added (Plan 5)
The current API returns JWT as a response body value. When the React PWA is built, do NOT store the JWT in `localStorage` (vulnerable to any XSS). Use `httpOnly + Secure + SameSite=Strict` cookies. If cookies are used, add CSRF protection (double-submit cookie pattern or synchronizer token) to all state-changing owner endpoints.

### INFO — Board Post Content Not Sanitized for HTML
`AuthorName` and `Content` are stored as-is (trimmed, length-bounded). Safe for the current JSON-only API. When the frontend (Plan 5) renders board messages, HTML-escape both fields to prevent stored XSS.

### INFO — `POST /share/{token}/board/{memberId}` Leaks Member Existence
Returns 403 when a member exists but is above the token's permission tier. Token holders can confirm whether any GUID corresponds to a real (non-deleted) member, even if they can't see it. Intentional per spec design — acceptable for this threat model.

## Frontend Patterns

### TabBar component
- Expects `tabs: { id: string; label: string }[]` — not plain strings
- Active prop is `activeTab`, not `active`
- Pass `[...TABS]` if TABS is `as const` (removes readonly so TabBar accepts it)

### Group Membership Architecture
- Group membership is managed group-centric from System page (GroupSheet → `POST /api/groups/{id}/members`)
- EssenceTab group chips are read-only display using `member.parentIds.includes(group.id)`
- No "set all groups for one member" endpoint — direction is group → members, not member → groups
- `Group.memberCount` is computed server-side in the SELECT projection; `Group.members[]` does not exist

### React Flow (SystemMap)
- Package is `@xyflow/react` (v12) — not the old `reactflow`
- Custom node types: `Node<Data, 'type'>`, `NodeProps<MyNodeType>`; needs `Handle` + `Position` imports
- Custom edge types: `BaseEdge` + `EdgeLabelRenderer` + `getStraightPath`; directed edges use `MarkerType.ArrowClosed`
- d3-force layout runs synchronously: `simulation.stop().tick(300)` inside `useMemo` — stable positions before first render, no animation
- `useNodesState`/`useEdgesState` return `setNodes`/`setEdges` that must be in `useEffect` dependency arrays
- `BottomSheet` is a **default export** — `import BottomSheet from '../BottomSheet'` (not named `{ BottomSheet }`)
- ResizeObserver mock for tests must be a **class constructor**, not `vi.fn()` — React Flow calls `new ResizeObserver(...)`
- `--legacy-peer-deps` needed for npm install due to `vite-plugin-pwa` peer conflict with Vite 8
- Test button selectors: `/→ directed/i` not `/directed/i` — "Undirected" also matches the looser pattern
- `onConnect` handler filters to `member-*` prefixed node IDs to block group-to-group connections

### Test Fixture Maintenance
- `npx vitest run` skips TypeScript type-checking — run `npm run build` (tsc -b) to catch fixture type errors after type migrations
- After changing a core type (e.g. Member), grep `__tests__` for stale field names before build
- `logout` in `AuthContext` returns `Promise<void>` — mock as `logout: () => Promise.resolve()`

## EF Core / Backend Patterns

- `m.ParentIds.Contains(id)` takes a `Guid`, not string — required for EF InMemory LINQ compatibility
- Route order matters: `[HttpPut("reorder")]` must be declared before `[HttpPut("{id:guid}")]`
- Two-migration strategy for breaking schema changes: Migration 1 additive (add + seed + UPDATE), Migration 2 destructive (drop old columns, add NOT NULL constraint)
- InMemory provider doesn't enforce FK constraints — tests can use FK GUIDs directly without seeding parent rows
- `memberCount` in list endpoints must be computed server-side in the LINQ `.Select()` projection, not derived client-side

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

## Design Context

### Users
Single user — the owner, daily driver, managing a DID/OSDD-1 system. Context: frequent use, often in high-activation states. The tool needs to be immediately navigable without friction, but it can have personality and life.

### Brand Personality
**Chaotic-ND vibrant energy — but in control.** Three words: vivid, grounded, alive.

The color palette (lime #b6ff00, hot pink #ff4db8, cyan #00d4ff, purple #b400ff) is intentional brand identity — not AI defaults. These colors ARE the system. The aesthetic should feel like it belongs to someone neurodivergent who built their own thing and isn't apologizing for it.

Emotional goal: open it and feel capable, not clinical. Energized, not overwhelmed.

### Aesthetic Direction
- Dark background is non-negotiable — dark canvas with vivid accent pops
- Palette is sacred — lime, pink, cyan, purple are all in play; use them with purpose, not everywhere
- Typography needs personality — Inter reads as "developer default." A display font for headings with character; body stays readable/functional
- Anti-references: Clinical SaaS, generic React admin dashboards, anything that could belong to a startup
- References: Things that feel handbuilt with strong personal taste. Bold, a little chaotic in a designed way.

### Design Principles
1. **The colors earn their chaos** — vivid accent colors are allowed and encouraged, but only when they mean something. Random color sprinkles = noise. Purposeful color = signal.
2. **Rhythm over uniformity** — identical `padding: 16px; gap: 12px` everywhere flattens everything. Vary density to indicate hierarchy.
3. **Typography carries personality** — headings should feel like this specific app, not every app. Inter stays for body/labels; a display font for page titles and headers gives the tool an identity.
4. **The tool is in control, even when colorful** — vibrant doesn't mean chaotic layout. Clear information architecture, obvious affordances, nothing buried.
5. **States talk** — empty states, loading states, errors should all have personality. Plain "No entries found" is a missed moment.
