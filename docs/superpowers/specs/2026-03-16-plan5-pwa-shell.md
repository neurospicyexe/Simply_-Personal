# Plan 5 Spec: PWA Shell (React Frontend)

## Goal

Build a mobile-first React PWA that provides a usable owner-facing frontend for Plural-Host: login, member list, member detail (profile + options), and current front management.

---

## Backend Changes (also Plan 5 scope)

### 1. httpOnly Cookie Auth (two required changes)

**a) `AuthController.LoginAsync`** — currently returns `Ok(new { token })`. Must be updated to set `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict` and return `200 OK` with no body. JWT generation logic unchanged.

**b) `Program.cs` JWT middleware** — currently reads tokens from `Authorization: Bearer` header only. Must add `Events.OnMessageReceived` to extract the token from the cookie:
```csharp
options.Events = new JwtBearerEvents
{
    OnMessageReceived = ctx =>
    {
        ctx.Token = ctx.Request.Cookies["token"];
        return Task.CompletedTask;
    }
};
```
Both changes are required. Without (b), every authenticated request returns 401 even after the cookie is set.

### 2. CORS Policy

`Program.cs` has no CORS configuration. The Vite dev server (`localhost:5173`) calling the API (`localhost:8080`) with `credentials: "include"` will be blocked by the browser without `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true`.

Add to `Program.cs`:
```csharp
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173")   // dev only
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
// ...
app.UseCors(); // before UseAuthentication
```
In production (same-origin via reverse proxy), CORS is not needed and the dev-only origin should be excluded.

### 3. Logout Endpoint

With httpOnly cookies the frontend cannot clear the token via JavaScript. Add:
```
POST /api/auth/logout
```
Responds with `Set-Cookie: token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict` and `200 OK`. Settings page calls this on tap of "Log out".

### 4. Front Entry Edit (start time + member correction)

`PATCH /v1/frontHistory/:id` currently supports only `endTime` and `customStatus`. The front card Edit form requires correcting `memberId` and `startTime`. Add support for these two fields to the existing PATCH handler:
```csharp
if (body.MemberId is not null) entry.MemberId = body.MemberId.Value;
if (body.StartTime.HasValue) entry.FrontStart = Epoch.FromMs(body.StartTime.Value);
```

---

## Out of Scope (Plan 5)

- Member detail tabs: History, Notes, Message Board, Custom Fields — deferred to Plan 6
- React Flow mind map — Plan 6
- 24h heatmaps — Plan 6
- Multi-user / SaaS — backend concern, not frontend
- Friends / Privacy Buckets management UI
- Journal UI
- Avatar upload — display existing avatar only; upload endpoint deferred to Plan 6

---

## Tech Stack

| Concern | Choice |
|---|---|
| Bundler | Vite 5 |
| Framework | React 18 + TypeScript |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| PWA | vite-plugin-pwa (service worker + manifest) |
| Styling | CSS Modules + CSS custom properties |
| No component library | Custom components only (full brand control) |

The app lives at `src/PluralHost.Web/` alongside the existing `src/PluralHost.Api/`.

---

## Auth

- JWT set by server via `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict` on successful `POST /api/auth/login` (backend change included in Plan 5 scope — see Backend Prerequisite above)
- Cookie sent automatically by browser on all same-origin requests via `credentials: "include"`
- Never stored in localStorage or sessionStorage
- `/login` is the only public route; all others redirect to `/login` if unauthenticated

---

## Routes

| Route | Screen |
|---|---|
| `/login` | Login |
| `/` | Redirect → `/front` |
| `/front` | Current Front |
| `/members` | Member List |
| `/members/:id` | Member Detail |
| `/history` | History (stub — "coming soon") |
| `/settings` | Settings (stub) |

---

## Navigation

**Bottom tab bar** — always visible on authenticated screens, 4 tabs:

| Tab | Route |
|---|---|
| Front | `/front` |
| Members | `/members` |
| History | `/history` (stub for Plan 6) |
| Settings | `/settings` |

---

## Brand Colors

```css
:root {
  --color-bg:      #121212;
  --color-surface: #1a1a1a;
  --color-primary: #b6ff00;   /* acid green — primary actions, timers, active states */
  --color-pink:    #ff4db8;   /* destructive/remove, secondary accents */
  --color-cyan:    #00d4ff;   /* data/info accents — counts, timestamps */
  --color-purple:  #b400ff;   /* privacy tier indicators */
  --color-text:    #f2f2f2;
  --color-muted:   #888888;
}

/* Per-alter color, injected via style attribute on the member card/page */
[data-member] { --member-color: /* hex from Member.Color */ ; }
```

---

## Avatar Component

Used everywhere a member appears. Always shows the member's color:

- **No image** → colored circle (`--member-color` background), white initial letter centered
- **Has image** → circular photo, `--member-color` ring border (3px solid)

---

## Screens

### Login (`/login`)

- Centered card on `#121212` background
- Logo / wordmark
- Password field only (single-owner system, no email identity)
- Sign In button (`#b6ff00` fill, `#121212` text)
- No register flow — single owner, self-hosted
- On success: server sets httpOnly cookie, frontend redirects to `/front`

---

### Current Front (`/front`)

**Header row:** "N fronting now" label + `+ Add Fronter` button (primary green).

**Fronter cards** — one per fronter, no limit:

Each card (expanded):
- Avatar (color ring, initial or photo)
- Name + pronouns
- Live timer (`#b6ff00`, updates every second via `setInterval`)
- Start date + time (e.g. "Started 10:22 AM · Mar 16")
- Status/note field — free-text, maps to `customStatus` in `PATCH /v1/frontHistory/:id` which stores to `FrontHistory.Comment`. Editable inline; tap to edit, enter to save.
- **Edit** button: inline form to correct alter (`memberId`) and start time (`startTime`) — requires backend change #4 above
- **Remove** button (`#ff4db8`) — calls `DELETE /v1/frontHistory/:id`

Cards default to expanded. Tap header area to collapse to compact view (avatar + name + timer only).

**Add Fronter** — opens a searchable member picker sheet. Selected member added to front with current timestamp.

---

### Member List (`/members`)

**Top bar:** Search input (full width).

**Toolbar:** Mode toggle (List ↔ Folder) + density toggle (Card ↔ Compact).

**List mode:**
- Members sorted A→Z, grouped under sticky letter headers
- Fronting indicator: small `#b6ff00` dot on avatar ring when currently fronting
- Card density: color-ring avatar + name + pronouns
- Compact density: name only (no avatar, no pronouns)

**Folder mode:**
- Groups shown as expandable folder cards
- Members listed inside each folder
- Same density toggle applies within folders
- Search filters within the active mode

Archived members are excluded from list by default (`GET /api/members` returns non-archived only). To reach an archived member's detail page, a future "show archived" toggle will be needed — deferred to Plan 6. In Plan 5, archived members are simply not visible in the list.

Tap a member → navigate to `/members/:id`.

---

### Member Detail (`/members/:id`)

**Header:**
- Color-ring avatar (large)
- Name, pronouns
- Member color swatch (tap to change)

**Two tabs: Profile | Options**

#### Profile tab

Inline-editable fields (tap to edit, save button appears):
- Avatar (display only in Plan 5 — upload deferred to Plan 6)
- Name
- Pronouns
- Description (multiline)
- Color (color picker)
- Groups (tag chips, tap to add/remove via `PATCH /v1/group/members`)

#### Options tab

- Privacy tier (segmented control: Public / Friend / Trusted / Private)
- Archived toggle (hides from list + search, keeps data)
- Prevent front notifications toggle
- Receive board notifications toggle

> **Note:** History, Notes, Message Board, and Custom Fields tabs are deferred to Plan 6.

---

### Settings (`/settings`)

Minimal stub page with one functional item:

- **Log out** button — calls `POST /api/auth/logout` (backend change #3), then redirects to `/login`

All other settings content deferred to Plan 6.

---

## PWA Requirements

- `vite-plugin-pwa` with `registerType: "autoUpdate"`
- `manifest.json`: name "Plural-Host", `#121212` background, `#b6ff00` theme color, standalone display
- App icon: 192×192 and 512×512 (placeholder SVG acceptable for Plan 5)
- Offline shell: service worker caches app shell; API calls fail gracefully with "offline" message when no network

---

## API Integration

All calls go to the existing `.NET` API. Base URL configurable via Vite env var (`VITE_API_BASE_URL`, defaults to `/api` for same-origin deployment).

| Screen | Endpoints used |
|---|---|
| Login | `POST /api/auth/login` |
| Logout | `POST /api/auth/logout` (backend change #3) |
| Front (read current fronters) | `GET /v1/fronters` |
| Front (add fronter) | `POST /v1/frontHistory` — body: `{ member: string, startTime: number (epoch ms), endTime?: number, customStatus?: string }` |
| Front (end fronting / status note) | `PATCH /v1/frontHistory/:id` — body: `{ live?: boolean, endTime?: number (epoch ms), customStatus?: string, memberId?: string, startTime?: number }` (last two require backend change #4) |
| Front (remove fronter) | `DELETE /v1/frontHistory/:id` |
| Member list | `GET /api/members` |
| Member detail (read/edit) | `GET /api/members/:id`, `PATCH /api/members/:id` |
| Groups (folder mode) | `GET /v1/groups/owner` |
| Group membership changes | `PATCH /v1/group/members` |

TanStack Query handles caching and refetch. Front screen polls every 30s via `refetchInterval`.

---

## File Structure

```
src/PluralHost.Web/
  index.html
  vite.config.ts
  src/
    main.tsx              # React root, QueryClientProvider, RouterProvider
    App.tsx               # Route definitions
    api/
      client.ts           # fetch wrapper (credentials: include, base URL)
      auth.ts
      members.ts
      front.ts
      groups.ts
    components/
      Avatar.tsx          # Color ring + initial / photo
      BottomNav.tsx       # 4-tab bottom bar
      MemberCard.tsx      # List item (card + compact variants)
      FrontCard.tsx       # Fronter card (expanded + collapsed)
      TabBar.tsx          # In-page tab switcher (Profile / Options)
    pages/
      LoginPage.tsx
      FrontPage.tsx
      MembersPage.tsx
      MemberDetailPage.tsx
      SettingsPage.tsx
    styles/
      globals.css         # CSS custom properties, resets
      tokens.css          # Color + spacing tokens
```

---

## Testing

- Vite + Vitest for unit tests
- React Testing Library for component tests
- Key tests: Avatar renders initial when no image, Avatar renders ring color, FrontCard timer increments, MemberList search filters correctly, Login redirects on success, protected routes redirect to `/login` when unauthenticated

---

## Security Notes

- JWT in httpOnly cookie only — never in localStorage or sessionStorage
- `credentials: "include"` on all fetch calls
- No sensitive data logged to console
- Avatar display uses existing `MediaController` (`GET /api/media/:id`) — auth-gated, no public URLs
- Avatar upload deferred to Plan 6
