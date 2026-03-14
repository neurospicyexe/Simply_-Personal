# Design Spec: Member Model Enrichment

**Date:** 2026-03-14
**Plan sequence:** Plan 1 of 5
**Status:** Approved — ready for implementation planning

---

## Context

Plural-Host already has a working `Member` entity with core fields (`Name`, `DisplayName`, `Pronouns`, `Color`, `Role`, `Description`, `AvatarPath`, `IsPrivate`, `MemberStatus`, `ParentIds`, `Groups`). This plan fills the remaining gaps to reach feature parity with Simply Plural's member model, adds a per-alter message board and notes system, introduces a managed front status picklist, and ensures EF migrations, DTOs, and tests stay consistent.

Privacy tiers and token permission upgrades are intentionally deferred to Plan 2. Custom fields (the programmable "Additional Info" tab) and global journals are Plan 3. Import pipeline is Plan 4.

Reference: `docs/reference/simply-plural-ui.md`

---

## Scope

### 1. Member entity — new fields

Seven new columns on the `Member` table:

| Field | Type | Default | Notes |
|---|---|---|---|
| `IsPinned` | `bool` | `false` | Floats member to top of active list |
| `IsArchived` | `bool` | `false` | Hides from list/count; member still appears in front history and is queryable. Not soft-delete. |
| `IsUntracked` | `bool` | `false` | Excludes member from analytics and heatmaps |
| `ExtraImages` | `List<string>` | `[]` | Up to 3 additional image URLs. Stored as JSON string via `ValueConverter<List<string>, string>`, same pattern as `ParentIds`. Max 3 enforced at service layer. |
| `PreventFrontNotification` | `bool` | `false` | Suppresses notifications when this member starts fronting |
| `ReceiveBoardNotifications` | `bool` | `true` | Notifies system when a message is posted to this member's board |
| `SpMemberId` | `string?` | `null` | Preserves the original Simply Plural member ID for import compatibility. Nullable — only populated during SP import. |

**`IsArchived` vs soft-delete:** Archived is a visibility flag — the member still participates in front history and can be queried. Soft-delete (`DeletedAt`) is the only path to true removal and remains gated by Gatekeeper PIN + 72-hour cooldown. These are orthogonal; a member can be both archived and soft-deleted.

---

### 2. FrontHistory — new fields

| Field | Type | Notes |
|---|---|---|
| `CustomStatusId` | `Guid?` | Nullable FK → `FrontStatus.Id`. The gold status tag shown on a front entry (e.g. "Co-con"). |
| `Comment` | `string?` | Max 500 chars. Free-text annotation on a front entry. Displayed via comment bubble icon. |

---

### 3. FrontStatus entity

A managed picklist for front entry status tags. Replaces the earlier free-text `CustomStatus` string design.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `Id` | `Guid` | PK |
| `Label` | `string` | Max 50 chars |
| `Color` | `string?` | Hex color string, optional |
| `IsDefault` | `bool` | Seeded community terms. Visible by default, can be hidden, never deleted. |
| `IsHidden` | `bool` | Allows suppressing a default term from the picker without losing it. |
| Inherits `BaseEntity` | | User-created terms: soft-deletable. Default terms: `DeletedAt` never set. |

**Seeded defaults (via `HasData`):**

Co-con · Blending · Switching · Stressed · Dissociating · Foggy · Passive influence · Full switch · Partial switch · Fronting alone

`IsDefault = true`, `IsHidden = false` for all seeded entries. Well-known GUIDs used so migrations are stable.

**UX flow:** Tapping the status field on a front entry opens a picker showing visible defaults + user-created terms. New terms can be created from the picker. Existing custom terms are soft-deletable. Default terms can be toggled hidden/visible.

---

### 4. BoardMessage entity

Per-alter message board (Tab 3 of the member profile). Internal alter-to-alter messages in Plan 1. Token-holder posting (`AllowsBoardPosting` on `AccessToken`) is deferred to Plan 2.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `MemberId` | `Guid` | FK → `Member.Id` |
| `AuthorName` | `string` | Max 100 chars. Display name of who left the message ("Ash", "System", etc.) |
| `Content` | `string` | Max 1000 chars |
| Inherits `BaseEntity` | | Soft-deletable, timestamps |

No `AuthorId` FK — Plural-Host is single-user/single-system. Author is identified by display name only. Token-sourced messages (Plan 2) will add an optional `TokenId` FK at that time.

---

### 5. MemberNote entity

Per-alter notes (Tab 5 of the member profile). These are private notes scoped to one member. Global (system-level) journals are deferred to Plan 3.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `MemberId` | `Guid` | FK → `Member.Id` |
| `Title` | `string?` | Max 100 chars, optional |
| `Content` | `string` | Max 50,000 chars |
| `IsPinned` | `bool` | Default `false` |
| `IsLocked` | `bool` | Default `false`. Locked notes cannot be edited until unlocked. |
| Inherits `BaseEntity` | | Soft-deletable, timestamps |

---

### 6. Group hierarchy — cycle detection

`Member.ParentIds` (existing) stores parent member IDs as a comma-separated GUID list. Currently there is no guard against circular references (A → B → A). This plan adds cycle detection at the service layer when `ParentIds` is updated:

- Walk the ancestor chain from each proposed parent upward
- If the current member's ID appears anywhere in the chain, reject with a validation error
- Max depth guard: reject chains deeper than 20 to prevent pathological traversal

No schema changes — cycle detection is purely service-layer logic.

---

### 7. SP API compatibility

The SP-compatible controllers (`SpMembersController`, `SpFrontController`) and response DTOs must be updated to include the new fields where SP has equivalents:

- `IsArchived` → SP exposes this as a member field
- `Color` already mapped; `ExtraImages` not in SP spec — omit from SP DTOs
- `FrontHistory.Comment` → SP includes comment on front entries
- `CustomStatusId` / `FrontStatus.Label` → SP includes a custom front status concept

New entities (`BoardMessage`, `MemberNote`, `FrontStatus`) are not part of the SP API mirror — they are Plural-Host native endpoints only.

---

## Data flow

```
POST /api/members              → create member (Name required, all new fields optional with defaults)
PATCH /api/members/{id}        → update any member field including new ones
GET /api/members               → returns all non-archived, non-deleted members by default
                                  ?includeArchived=true → include archived
GET /api/members/{id}          → full member detail

GET  /api/members/{id}/board        → list board messages (soft-delete filtered)
POST /api/members/{id}/board        → post a message
DELETE /api/members/{id}/board/{msgId} → soft-delete a message

GET  /api/members/{id}/notes        → list notes (soft-delete filtered)
POST /api/members/{id}/notes        → create note
PATCH /api/members/{id}/notes/{noteId} → update (blocked if IsLocked = true)
DELETE /api/members/{id}/notes/{noteId} → soft-delete

GET  /api/front-statuses            → list visible statuses (IsHidden = false)
POST /api/front-statuses            → create custom status
PATCH /api/front-statuses/{id}      → update label/color or toggle IsHidden
DELETE /api/front-statuses/{id}     → soft-delete (user-created only; IsDefault = true rejected)
```

---

## Error handling

| Scenario | Behaviour |
|---|---|
| `ExtraImages` count > 3 | 400 Bad Request — "Maximum 3 extra images allowed" |
| `ParentIds` creates a cycle | 400 Bad Request — "Circular parent reference detected" |
| `ParentIds` chain depth > 20 | 400 Bad Request — "Parent chain exceeds maximum depth" |
| Delete a default `FrontStatus` | 400 Bad Request — "Default statuses cannot be deleted" |
| Edit a locked `MemberNote` | 400 Bad Request — "Note is locked. Unlock it before editing." |
| `CustomStatusId` references deleted/hidden status | Accepted — stored FK is preserved; picker just won't show it as selectable going forward |

Ghost Mode: all member, board, and note queries return `[]` (200 OK) when `SystemSettings.IsFrozen = true`. This is enforced automatically by the existing EF Core global query filter — no controller changes needed.

---

## Testing

Each new area gets dedicated test coverage:

- **Member fields:** update round-trip for each new bool flag and `ExtraImages`; verify `IsArchived` does not affect soft-delete
- **FrontHistory:** comment and custom status FK round-trip; null status accepted
- **FrontStatus:** seed verification (10 defaults present after migration); create/hide/unhide/delete user term; delete-default rejected
- **BoardMessage:** post/list/soft-delete; verify Ghost Mode returns empty
- **MemberNote:** create/edit/pin/lock; edit-while-locked rejected; soft-delete
- **Cycle detection:** direct cycle (A→A), indirect cycle (A→B→A), valid chain, depth overflow

---

## Migration

One EF Core migration covering:
- 7 new columns on `Member`
- 2 new columns on `FrontHistory`
- New `FrontStatus` table with `HasData` seed
- New `BoardMessages` table
- New `MemberNotes` table
- FK constraint: `FrontHistory.CustomStatusId → FrontStatus.Id` (nullable, no cascade delete)
- FK constraints: `BoardMessage.MemberId → Member.Id`, `MemberNote.MemberId → Member.Id`

Auto-applied on startup via `context.Database.MigrateAsync()` (existing pattern).

---

## Out of scope (deferred)

| Feature | Plan |
|---|---|
| `AllowsBoardPosting` on `AccessToken` (token holders post to boards) | Plan 2 |
| Privacy tiers on `Member` (public/friend/trusted/private replacing `IsPrivate`) | Plan 2 |
| Named share tokens with permission levels | Plan 2 |
| Custom fields (programmable "Additional Info" tab) | Plan 3 |
| Global (system-level) journals | Plan 3 |
| Simply Plural / PluralKit import pipeline | Plan 4 |
| React Flow mind map, heatmaps, PWA | Plan 5 |
