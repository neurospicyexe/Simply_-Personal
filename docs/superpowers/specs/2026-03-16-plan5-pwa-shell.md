# Plan 5 Spec: PWA Shell (React Frontend)

## Goal

Build a mobile-first React PWA that provides a usable owner-facing frontend for Plural-Host: login, member list, member detail (profile + options), and current front management.

---

## Out of Scope (Plan 5)

- Member detail tabs: History, Notes, Message Board, Custom Fields — deferred to Plan 6
- React Flow mind map — Plan 6
- 24h heatmaps — Plan 6
- Multi-user / SaaS — backend concern, not frontend
- Friends / Privacy Buckets management UI
- Journal UI

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

- JWT returned from `POST /api/auth/login`
- Stored in an **httpOnly cookie** (not localStorage — per security requirements in CLAUDE.md)
- All API calls include cookie automatically via `credentials: "include"`
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
| `/settings` | Settings (stub) |

---

## Navigation

**Bottom tab bar** — always visible on authenticated screens, 4 tabs:

| Tab | Route |
|---|---|
| Front | `/front` |
| Members | `/members` |
| Settings | `/settings` |
| Home | `/` |

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
- Email + password fields
- Sign In button (`#b6ff00` fill, `#121212` text)
- No register flow — single owner, self-hosted
- On success: store JWT in httpOnly cookie, redirect to `/front`

---

### Current Front (`/front`)

**Header row:** "N fronting now" label + `+ Add Fronter` button (primary green).

**Fronter cards** — one per fronter, no limit:

Each card (expanded):
- Avatar (color ring, initial or photo)
- Name + pronouns
- Live timer (`#b6ff00`, updates every second via `setInterval`)
- Custom status (editable inline)
- Start date + time
- Per-front comment field
- **Edit** button: inline form to correct alter, start date/time
- **Remove** button (`#ff4db8`)

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
- Avatar (tap to upload or clear)
- Name
- Pronouns
- Description (multiline)
- Color (color picker)
- Groups (tag chips, tap to add/remove)

#### Options tab

- Privacy tier (segmented control: Public / Friend / Trusted / Private)
- Archived toggle (hides from list + search, keeps data)
- Prevent front notifications toggle
- Receive board notifications toggle

> **Note:** History, Notes, Message Board, and Custom Fields tabs are deferred to Plan 6.

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
| Front | `GET /api/front-status`, `POST /api/front-status`, `PATCH /api/front-status/:id`, `DELETE /api/front-status/:id` |
| Member list | `GET /api/members` |
| Member detail | `GET /api/members/:id`, `PATCH /api/members/:id` |
| Groups (folder mode) | `GET /api/groups` |

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
- Avatar uploads go through existing `MediaController` (already auth-gated)
