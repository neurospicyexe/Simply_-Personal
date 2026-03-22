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

- `apiFetch` (in `src/api/client.ts`) throws `new Error(\`${res.status} ...\`)` — NOT a `Response` object. Extract status with `parseInt((err as Error).message)`. Extract 409 body with `msg.slice(msg.indexOf('{'))`.
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

## Pending / Watch List

- No rate limiting on `/api/auth/login` or `/api/secure/freeze` yet (known security backlog).
- Cookie `Secure = true` will break if served over plain HTTP in production without a TLS proxy.
- `POST /api/auth/setup` is one-time only — returns 409 if password already set.
- Orphaned upload files: if avatar upload succeeds but the subsequent PATCH fails, the file stays in `secure_uploads/` with no member pointing to it. No cleanup mechanism yet.
- `pinIsSet` flips to `true` before the "PIN set." success message renders in SettingsPage — shows "PIN changed." on first-set. Cosmetic, non-blocking.
