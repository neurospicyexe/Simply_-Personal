# Per-Alter Theming — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Overview

Each member (alter) can have a personal theme applied to their `MemberDetailPage`. The theme consists of:

- A **background image** (optional upload) used as a full-bleed hero
- A **color** (`member.color`, already exists) used as the accent and fallback tint

Photo album (multiple per-alter images) is out of scope for this plan — next plan after this one.

---

## Scope

Theming applies **only to `MemberDetailPage`**. The app-wide theme is unchanged. No app-wide theme shift when an alter is fronting.

---

## Backend

### Entity change

Add `BackgroundImagePath string?` (nullable) to the `Member` entity.

```csharp
public string? BackgroundImagePath { get; set; }
```

No Ghost Mode filter needed — it's a plain nullable string field, not a navigable entity.

### DTO change

Add `BackgroundImagePath string?` to `MemberUpdateRequest` alongside the existing `AvatarPath`:

```csharp
public string? BackgroundImagePath { get; set; }
```

`PATCH /api/members/{id}` already handles partial updates — no new endpoints required.

### Migration

One EF Core migration: add nullable `BackgroundImagePath TEXT` column to `Members` table. No default, no data backfill needed.

### Media upload

No changes. The existing `POST /api/media/upload` endpoint handles the upload. Frontend uploads, receives a path, then PATCHes the member.

---

## Frontend

### CSS custom properties

`MemberDetailPage` sets two CSS vars as an inline style on its root element:

```tsx
<div
  style={{
    '--member-color': member.color ?? '#888888',
    '--member-bg-image': member.backgroundImagePath
      ? `url("/api/media/${member.backgroundImagePath}")`
      : 'none',
  } as React.CSSProperties}
>
```

All child components read from these vars. No prop drilling, no context.

### Hero area

The hero div is the full-width strip at the top of `MemberDetailPage` above the tab bar.

**When `--member-bg-image` is set (background image uploaded):**
- `background-image: var(--member-bg-image)` with `background-size: cover; background-position: center`
- Dark gradient overlay: `linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)`
- Avatar name and pronouns rendered in white with `text-shadow` for readability

**When `--member-bg-image` is `none` (color fallback):**
- `background: linear-gradient(135deg, color@27% 0%, color@13% 50%, transparent 100%)` where color = `--member-color`
- Same gradient overlay (lighter, since no photo to obscure)
- Avatar, name, pronouns as normal

**Avatar in hero:** display-only. No pencil button. Edit affordance moves to EssenceTab.

### Tab bar accent

Active tab color and underline read from `var(--member-color)`. Already the case via existing CSS; this plan makes it explicit via the scoped CSS var.

### Page body tint

Immediately below the tab bar:

The tint is applied by reading `--member-color` in the component's inline style and passing it as an rgba value at ~5% opacity. CSS relative color syntax (`color(--member-color / 5%)`) is not used — compute the rgba string in the component from the hex value.

Dissolves into the standard `--color-bg` dark by 40% of the page height.

### EssenceTab — Appearance section

New labeled section at the top of EssenceTab, above Bio. Single horizontal row:

```
[ avatar circle ✎ ]  [ bg image slot ]  [ color swatch ]
```

**Avatar circle:** The existing pencil-overlay upload flow, moved here from `MemberDetailPage` header. Behavior unchanged.

**Background image slot:**
- Empty state: dashed border, `+ add background image` label. Click opens file picker.
- Upload flow: `POST /api/media/upload` → receive path → `PATCH /api/members/:id` with `{ backgroundImagePath: path }`
- Filled state: thumbnail preview of the image + `✕` remove button. Remove: `PATCH /api/members/:id` with `{ backgroundImagePath: null }`
- Error handling: revert to previous state on upload failure (same pattern as avatar upload)

**Color swatch:** 28×28px square filled with `member.color`. Opens the existing color picker inline. No change to color picker behavior.

### MemberDetailPage header cleanup

Remove the pencil button overlay from the avatar circle in the page header. The circle becomes display-only. All appearance editing happens in EssenceTab.

---

## Testing

### Frontend

**`MemberDetailPage.test.tsx`**
- `--member-color` is set on root element from `member.color`
- `--member-bg-image` is set to `url(...)` when `backgroundImagePath` is set
- `--member-bg-image` is `none` when `backgroundImagePath` is null
- Hero uses background-image style when path is set
- Hero uses gradient fallback when path is null
- Avatar circle in header has no pencil button

**`EssenceTab.test.tsx`**
- Appearance section renders above Bio
- Avatar pencil button is inside Appearance section
- Background image slot shows empty state when `backgroundImagePath` is null
- Background image slot shows thumbnail + remove when `backgroundImagePath` is set
- Upload flow: calls `uploadMedia` then `updateMember` with returned path
- Remove: calls `updateMember` with `backgroundImagePath: null`
- Reverts on upload error

### Backend

**Migration test:** nullable `BackgroundImagePath` column added, no default.

**`MembersControllerTests`:**
- `PATCH /api/members/{id}` persists `backgroundImagePath` when provided
- `PATCH /api/members/{id}` clears `backgroundImagePath` when `null` is sent

---

## What this does NOT include

- App-wide theme shift when an alter is fronting (future work)
- Per-alter accent color separate from `member.color` (not needed — `member.color` already serves this)
- Photo album / multiple per-alter images (next plan)
