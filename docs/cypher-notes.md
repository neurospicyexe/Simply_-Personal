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
- `PATCH /api/members/:id` — partial update (any subset of fields).
- Ghost Mode (`SystemSettings.IsFrozen = true`) makes member/front/group queries return empty arrays — not 404, just `200 []`.
- Soft delete only — nothing is ever hard-deleted.

## Pending / Watch List

- No rate limiting on `/api/auth/login` or `/api/secure/freeze` yet (known security backlog).
- Cookie `Secure = true` will break if served over plain HTTP in production without a TLS proxy.
- `POST /api/auth/setup` is one-time only — returns 409 if password already set.
