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
    Domain/             # ISoftDeletable, BaseEntity, Member (PrivacyTier), SystemSettings, AccessToken, FrontHistory, Group, BoardMessage, MemberNote, FrontStatus, CustomField, CustomFieldValue, JournalEntry
    Data/               # PluralHostContext (EF Core DbContext with global filters)
      Migrations/       # EF Core migration files (committed to repo)
    Services/           # IGhostModeService, IGatekeeperService, IShareTokenService, ITokenVisibilityService, IAuthService, IMemberService
    Controllers/        # SecureActionController, ShareController, TokensController, MembersController, BoardController, MemberNotesController, FrontStatusController, SpMembersController, SpFrontController, SpGroupsController, MediaController, FieldsController, MemberFieldsController, JournalsController
    BackgroundServices/ # AutoUnfreezeService
    Dto/                # NativeDtos.cs, SpDtos.cs
  PluralHost.Web/       # React PWA (Vite + TypeScript, port 5173 in dev)
    src/
      api/              # apiFetch client + per-domain modules (auth, members, front, groups)
      components/       # Avatar, BottomNav, FrontCard, MemberCard, TabBar, CreateMemberSheet
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

**Next — Plan 6 (not yet specced/planned):**
- Member detail: History tab, Notes tab, Message Board tab, Custom Fields tab
- Avatar upload (`POST /api/media/upload` — endpoint not yet built)
- Journal UI (`/journals` page)
- Groups management UI (create/edit/delete groups; batch-assign members from the group side)
- Friends / Privacy Buckets management UI
- React Flow mind map (system visualization)
- 24h front heatmaps
- Per-alter theming (background, accent color)
- Delete member flow (Gatekeeper PIN gate, soft-delete only)

**SP UI Alignment (reference: `docs/reference/simply-plural-ui.md`):**
- Goal: all of SP's features, but actually beautiful and desktop-first-responsive
- Do NOT replicate: mobile-only layout, thin left-edge color bars, alter-by-alter bucket assignment
- DO improve on: member color usage (let it breathe), bucket-to-alters assignment direction, per-alter theming, desktop sidebar/panel layout alongside mobile-first responsive
- SP member profile has 6 tabs (Groups / Profile / Board / History / Notes / Options) — we have 2 now (Profile / Options); rest come in Plan 6

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
