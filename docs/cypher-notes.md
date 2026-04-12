# Cypher's Running Notes — Simply Personal

Things learned in session, kept for continuity.

---

## Auth / Login

- `LoginPasswordHash` in `SystemSettings` starts as `null` — must call `POST /api/auth/setup` once before login works.
- Cookie uses `Secure = true` + `SameSite=Strict`. Modern browsers treat `localhost` as a secure origin so this works fine on local dev.
- JWT signing key lives in `.env` as `JWT_SIGNING_KEY` — already set to `local-dev-key-change-this-before-deploying-abc123`.
- Docker service is named `pluralhost`, not `api`. Use `docker compose exec pluralhost sh` not `docker compose exec api sh`.

## Dev Setup

- Two things must be running simultaneously:
  1. Docker container (API on `:8080`) — `docker compose up -d`
  2. Vite dev server (frontend on `:5173`) — `cd src/PluralHost.Web && npm run dev`
- Vite proxies `/api` and `/v1` to `http://localhost:8080` (see `vite.config.ts`).
- SQLite DB is at `./data/pluralhost.db` on the host (volume-mounted). Can read it with Bun: `const { Database } = require('bun:sqlite')`.

## Frontend Architecture

- Vite + React (not Next.js) — `'use client'` directives do NOT apply here, ignore those hook suggestions.
- CSS Modules + custom properties from `src/styles/tokens.css`. Key tokens: `--color-bg` `--color-surface` `--color-primary` (#b6ff00 lime) `--color-muted` `--touch-min: 44px`.
- TanStack Query for all data fetching. Cache key `['members']` used on MembersPage — `invalidateQueries({ queryKey: ['members'] })` refreshes the list.
- Bottom sheet pattern for modals: fixed backdrop + slide-up container, `--z-overlay: 20` / `--z-modal: 30`.

## API Notes

- `POST /api/members` — creates a member. Body: `{ name, displayName?, pronouns?, color?, description?, privacyTier? }`.
- `PATCH /api/members/:id` — partial update (any subset of fields). Accepts `avatarPath` (string filename like `uuid.jpg`).
- `DELETE /api/members/:id` — soft-delete. Body: `{ pin: "..." }`. Returns 403 (wrong PIN), 409 (cooldown active, body has `cooldownEnd` ISO timestamp), 204 (success).
- `POST /api/media/upload` — multipart/form-data, field name `file`. Returns `{ id: "uuid.ext" }`. Max 5MB; allowlist: jpg/jpeg/png/gif/webp; validates magic bytes.
- `GET /api/media/:id` — serves file behind auth. The `id` is the filename (`uuid.ext`) returned by upload.
- `GET /api/secure/status` — returns `{ pinIsSet: bool, deletionCooldownEnd: string|null }`.
- `PUT /api/secure/pin` — body `{ currentPin?: string, newPin: string }`. First-time: omit `currentPin`. Returns 403 (wrong current PIN), 400 (invalid new PIN), 204.
- `POST /api/auth/change-password` — body `{ currentPassword, newPassword, gatekeeperPin? }`. Returns 403 for wrong password or PIN (not 401 — user is already authenticated).
- Ghost Mode (`SystemSettings.IsFrozen = true`) makes member/front/group queries return empty arrays — not 404, just `200 []`.
- Soft delete only — nothing is ever hard-deleted.

## Frontend Gotchas

- `apiFetch` (in `src/api/client.ts`) throws `new Error(body?.error ?? \`Request failed (${status})\`)` — parses JSON error response, uses the `error` field. No raw server text in error messages. For 409 with structured body, catch and re-parse separately if you need the payload (e.g. `cooldownEnd`).
- For multipart uploads, use raw `fetch` with `credentials: 'include'` — do NOT wrap in `apiFetch` (which sets `Content-Type: application/json`).
- Avatar field is `avatarPath` (not `avatarId`) in both TypeScript types and the backend DTO.
- `BottomSheet` component in `src/components/BottomSheet.tsx` — use for any sheet/modal UI. Props: `open`, `onClose`, `children`.
- `useReducedMotion` hook in `src/components/useReducedMotion.ts` for animation accessibility.

## Tab Architecture (MemberDetailPage)

Six tabs implemented: Essence, Specs, Dossier, Comms, Logs, Access. Each is a standalone component in `src/components/tabs/`. `TabBar` handles routing between them. Tab state lives in `MemberDetailPage` and is passed down.

- **EssenceTab** — bio, pronouns, description, color, avatar upload (pencil button overlay)
- **SpecsTab** — custom fields (GET/POST/DELETE `/api/fields`, GET/PUT/DELETE `/api/members/:id/fields`)
- **DossierTab** — member notes (GET/POST/DELETE `/api/members/:id/notes`)
- **CommsTab** — board messages (GET/POST `/api/board` filtered by member)
- **LogsTab** — front history (GET `/api/front/history`)
- **AccessTab** — privacy tier, group membership, danger zone (delete with PIN + cooldown)

## Bug Fixes Applied (2026-04-04)

- **uid="owner" bug** — `SpFrontContent.Uid` was hardcoded to `"owner"` in `ToEnvelope`. Every FrontCard operation (remove, status update, edit, comment save) routed `entry.uid` as the URL param → `DELETE /v1/frontHistory/owner` → GUID parse fail → 404. Fixed: FrontPage closures now capture `envelope.id` from the map; FrontCard callbacks ignore the uid param.
- **LogsTab 404 on save/delete** — same uid bug. `selected.content.uid` ("owner") replaced with `selected.id` (actual GUID).
- **LogsTab status field** — was a plain text input. Now opens StatusPickerSheet backed by a `front-statuses` query.
- **Duplicate fronters** — `POST /v1/frontHistory` now returns 409 Conflict if member already has an active session (`FrontEnd == null`). Picker also hides already-fronting members.
- **Groups in member profile** — AccessTab had no group management. Added group checkbox section using new `POST/DELETE /api/groups/{id}/members/{memberId}` endpoints.
- **Groups alphabetical** — SystemPage Groups tab now sorts A-Z before render.
- **FrontCard comment Enter key** — Enter (without Shift) now saves immediately in addition to onBlur.

## Security Notes (2026-04-04)

Full audit complete. `docs/security-audit.md` is the authoritative record. Summary of current state: **0 Critical | 0 High | 0 Medium | 0 Low | 6 Info (accepted tradeoffs).**

Key things fixed this session:
- SP export file (`simply_plural_export.json`) was in git history — purged from all 319 commits, force-pushed. `.gitignore` updated.
- Global exception handler added — no stack traces leak on 500 errors.
- Security event logging added — failed login, PIN failures, freeze/unfreeze all log with IP.
- `IsFrozenAsync()` now checks `FreezeEndDate` — timed freeze lifts immediately when expired.
- Gatekeeper PIN minimum raised to 8 characters.
- `apiFetch` error sanitized — parses JSON `error` field, no raw server text.
- Bare catch blocks in `AvatarDownloadService` now log before returning null.

Rate limiting: `[EnableRateLimiting("login")]` on `/api/auth/login` (10/min), `[EnableRateLimiting("freeze")]` on `/api/secure/freeze` (5/min) — both active.

## Bug Fixes Applied (2026-04-05)

- **Service worker stale cache** — PWA with Workbox precache was serving old compiled JS across `git pull` + rebuild cycles. Hard refresh (`Ctrl+Shift+R`) doesn't bypass a registered SW. Fix: added `clientsClaim: true`, `skipWaiting: true` to workbox config in `vite.config.ts` so new SW takes over immediately; added `devOptions: { enabled: false }` to prevent SW from interfering with `npm run dev`. One-time fix: unregister via DevTools → Application → Service Workers → Unregister.
- **StatusPickerSheet can't scroll** — `.list` had no `min-height: 0` or `overflow-y`. As a flex item, it defaults to `min-height: auto` which prevents the parent from ever clipping it — overflow never fires. Fix: added `min-height: 0; overflow-y: auto` to `.list` in `StatusPickerSheet.module.css`.
- **BottomSheet scroll bleeds through** — scrolling inside any bottom sheet also scrolled the page behind it. Fix: added `overscroll-behavior: contain` to `.sheet` in `BottomSheet.module.css`.
- **Image upload errors swallowed** — `mediaApi.upload` threw the raw `Response` object on failure; catch block in EssenceTab couldn't read the error message and always showed "Upload failed. Please try again." Fix: now parses JSON body and throws `new Error(body?.error ?? \`Upload failed (${status})\`)` — actual server message (e.g. "Extension '.heic' is not allowed") now surfaces in the UI.
- **Upload file picker too permissive** — `accept="image/*"` offered HEIC/AVIF/BMP/TIFF etc. which the backend rejects with 400. Fix: both avatar and background inputs now use `accept=".jpg,.jpeg,.png,.gif,.webp"` to match backend allowlist.

## Known Remaining Issues

### Pending / Watch List

- Cookie `Secure = true` will break if served over plain HTTP in production without a TLS proxy.
- `POST /api/auth/setup` is one-time only — returns 409 if password already set.
- Orphaned upload files: if avatar upload succeeds but the subsequent PATCH fails, the file stays in `secure_uploads/` with no member pointing to it. No cleanup mechanism yet.
- `pinIsSet` flips to `true` before the "PIN set." success message renders in SettingsPage — shows "PIN changed." on first-set. Cosmetic, non-blocking.
- `PUT /api/secure/pin` — minimum PIN length is now 8 characters (raised from 4 on 2026-04-04).
