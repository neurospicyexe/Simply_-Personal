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
| `ExtraImages` | `List<string>` | `[]` | Up to 3 additional image URLs. See storage note below. |
| `PreventFrontNotification` | `bool` | `false` | Suppresses notifications when this member starts fronting |
| `ReceiveBoardNotifications` | `bool` | `true` | Notifies system when a message is posted to this member's board |
| `SpMemberId` | `string?` | `null` | Preserves the original Simply Plural member ID for import compatibility. Nullable — only populated during SP import. |

**`IsArchived` vs soft-delete:** Archived is a visibility flag — the member still participates in front history and can be queried. Soft-delete (`DeletedAt`) is the only path to true removal and remains gated by Gatekeeper PIN + 72-hour cooldown. These are orthogonal; a member can be both archived and soft-deleted.

**`ExtraImages` storage:** Stored as a JSON string in a SQLite `TEXT` column using `ValueConverter<List<string>, string>` with `System.Text.Json.JsonSerializer` (already a transitive dependency via ASP.NET Core). A `ValueComparer<List<string>>` must also be registered in `PluralHostContext.OnModelCreating` to prevent spurious EF Core change-tracking on list mutations — same pattern as `ParentIds`.

**SP DTO — `Archived` field:** The existing `SpMemberContent.Archived` property currently maps from `m.Status is MemberStatus.Dormant or MemberStatus.Gone`. After this migration, it must be updated to map from `m.IsArchived` instead. The `MemberStatus` enum is retained for its own purpose (Active/Dormant/Fused/Gone) — only the `Archived` field mapping changes. The old Status-based `Archived` mapping is removed.

---

### 2. FrontHistory — new fields

| Field | Type | Notes |
|---|---|---|
| `CustomStatusId` | `Guid?` | Nullable FK → `FrontStatus.Id`. The gold status tag shown on a front entry (e.g. "Co-con"). |
| `Comment` | `string?` | Max 500 chars. Free-text annotation on a front entry. Displayed via comment bubble icon. |

---

### 3. FrontStatus entity

A managed picklist for front entry status tags.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `Id` | `Guid` | PK — use well-known stable GUIDs from seed table below |
| `Label` | `string` | Max 50 chars |
| `Color` | `string?` | Hex color string, optional |
| `IsDefault` | `bool` | Seeded community terms. Visible by default, can be hidden, never deleted. |
| `IsHidden` | `bool` | Allows suppressing a default term from the picker without losing it. |
| Inherits `BaseEntity` | | User-created terms: soft-deletable. Default terms: `DeletedAt` never set. |

**Seeded defaults (via `HasData`) — stable GUIDs:**

| Label | GUID |
|---|---|
| Co-con | `a1000000-0000-0000-0000-000000000001` |
| Blending | `a1000000-0000-0000-0000-000000000002` |
| Switching | `a1000000-0000-0000-0000-000000000003` |
| Stressed | `a1000000-0000-0000-0000-000000000004` |
| Dissociating | `a1000000-0000-0000-0000-000000000005` |
| Foggy | `a1000000-0000-0000-0000-000000000006` |
| Passive influence | `a1000000-0000-0000-0000-000000000007` |
| Full switch | `a1000000-0000-0000-0000-000000000008` |
| Partial switch | `a1000000-0000-0000-0000-000000000009` |
| Fronting alone | `a1000000-0000-0000-0000-000000000010` |

All seeded entries: `IsDefault = true`, `IsHidden = false`, `Color = null`.

**Ghost Mode:** `FrontStatus` is a configuration picklist, not member data. It is **excluded** from Ghost Mode suppression. `GET /api/front-statuses` always returns results regardless of `IsFrozen`. The picker must remain available during a freeze so the system owner can still manage configuration.

**UX flow:** Tapping the status field on a front entry opens a picker showing visible statuses. New terms can be created from the picker. Existing custom terms are soft-deletable (Gatekeeper PIN required — see Gatekeeper section). Default terms can be toggled hidden/visible.

---

### 4. BoardMessage entity

Per-alter message board (Tab 3 of the member profile). Internal alter-to-alter messages in Plan 1. Token-holder posting (`AllowsBoardPosting` on `AccessToken`) is deferred to Plan 2.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `MemberId` | `Guid` | FK → `Member.Id` |
| `AuthorName` | `string` | Max 100 chars. Display name of who left the message ("Ash", "System", etc.) |
| `Content` | `string` | Required. Max 1000 chars. |
| Inherits `BaseEntity` | | Soft-deletable, timestamps |

No `AuthorId` FK — Plural-Host is single-user/single-system. Author is identified by display name only. Token-sourced messages (Plan 2) will add an optional `TokenId` FK at that time.

**Ghost Mode:** `BoardMessage` must have an explicit `HasQueryFilter` in `PluralHostContext.OnModelCreating`:

```csharp
modelBuilder.Entity<BoardMessage>()
    .HasQueryFilter(b =>
        b.DeletedAt == null &&
        !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());
```

This follows the identical pattern used for `Member`, `FrontHistory`, and `Group`.

---

### 5. MemberNote entity

Per-alter notes (Tab 5 of the member profile). Private notes scoped to one member. Global (system-level) journals are deferred to Plan 3.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `MemberId` | `Guid` | FK → `Member.Id` |
| `Title` | `string?` | Max 100 chars, optional |
| `Content` | `string` | **Required.** Must be non-empty. Max 50,000 chars. |
| `IsPinned` | `bool` | Default `false` |
| `IsLocked` | `bool` | Default `false`. Locked notes reject all edits until unlocked. |
| Inherits `BaseEntity` | | Soft-deletable, timestamps |

**Ghost Mode:** `MemberNote` must have an explicit `HasQueryFilter` in `PluralHostContext.OnModelCreating` using the same combined pattern as `BoardMessage` above.

---

### 6. Group hierarchy — cycle detection

`Member.ParentIds` (existing) stores parent member IDs as a comma-separated GUID list. This plan adds cycle detection at the service layer when `ParentIds` is updated.

**Service:** A new `IMemberService` / `MemberService` is introduced. The `UpdateMemberAsync` method in this service is responsible for:

- Walking the ancestor chain from each proposed parent upward (loading `ParentIds` per ancestor)
- If the current member's own ID appears anywhere in the chain → reject
- If the traversal depth exceeds 20 → reject
- On pass → persist the update

No schema changes — cycle detection is purely service-layer logic.

---

### 7. Gatekeeper PIN requirements

Soft-deleting data is a destructive action consistent with the project's pattern of PIN-gating irreversible operations. The following endpoints require a valid Gatekeeper PIN in the request body:

| Endpoint | PIN required |
|---|---|
| `DELETE /api/members/{id}/board/{msgId}` | Yes |
| `DELETE /api/members/{id}/notes/{noteId}` | Yes |
| `DELETE /api/front-statuses/{id}` (user-created only) | Yes |

Toggling `FrontStatus.IsHidden` does not require PIN — it is reversible.

---

### 8. API endpoints

```
POST   /api/members                           → create member (Name required, all new fields optional)
PATCH  /api/members/{id}                      → update any member field including new ones
GET    /api/members                           → list non-deleted members
                                                  default: excludes archived (?includeArchived=true to include)
                                                  IsPrivate members ARE included (authenticated owner only)
                                                  Privacy filtering for share tokens is Plan 2
GET    /api/members/{id}                      → full member detail

GET    /api/members/{id}/board                → list board messages (Ghost Mode + soft-delete filtered)
POST   /api/members/{id}/board                → post a message (AuthorName + Content required)
DELETE /api/members/{id}/board/{msgId}        → soft-delete (Gatekeeper PIN required)

GET    /api/members/{id}/notes                → list notes (Ghost Mode + soft-delete filtered)
POST   /api/members/{id}/notes                → create note (Content required, Title optional)
PATCH  /api/members/{id}/notes/{noteId}       → update (blocked if IsLocked = true)
DELETE /api/members/{id}/notes/{noteId}       → soft-delete (Gatekeeper PIN required)

GET    /api/front-statuses                    → list visible statuses (IsHidden = false; Ghost Mode exempt)
POST   /api/front-statuses                    → create custom status
PATCH  /api/front-statuses/{id}              → update Label/Color or toggle IsHidden
DELETE /api/front-statuses/{id}              → soft-delete user-created only (Gatekeeper PIN required)
```

---

### 9. Error handling

| Scenario | Response |
|---|---|
| `ExtraImages` count > 3 | 400 — "Maximum 3 extra images allowed" |
| `FrontHistory.Comment` > 500 chars | 400 — "Comment must be 500 characters or fewer" |
| `ParentIds` creates a cycle | 400 — "Circular parent reference detected" |
| `ParentIds` chain depth > 20 | 400 — "Parent chain exceeds maximum depth of 20" |
| Delete a default `FrontStatus` (`IsDefault = true`) | 400 — "Default statuses cannot be deleted" |
| Edit a locked `MemberNote` | 400 — "Note is locked. Unlock it before editing." |
| `MemberNote.Content` empty or whitespace | 400 — "Note content is required" |
| `CustomStatusId` references a deleted/hidden status | Accepted — stored FK preserved; picker simply omits it from selectable options going forward |
| Any PIN-gated delete with invalid PIN | 403 — existing Gatekeeper pattern |

Ghost Mode: `BoardMessage` and `MemberNote` queries return `[]` (200 OK) when `SystemSettings.IsFrozen = true`, enforced via `HasQueryFilter` (see entities above). `FrontStatus` is exempt from Ghost Mode.

---

### 10. Testing

| Area | Test cases |
|---|---|
| **Member fields** | Round-trip update for each new bool flag; `ExtraImages` add/update/clear; `IsArchived` does not affect `DeletedAt`; `SpMemberId` round-trip |
| **FrontHistory** | `Comment` and `CustomStatusId` round-trip; null status accepted; comment > 500 chars rejected |
| **FrontStatus** | 10 seed entries present after migration; create user term; hide/unhide default; delete user term (PIN); delete default rejected; `IsHidden` filter on GET |
| **BoardMessage** | Post/list/soft-delete (PIN); empty/oversized content rejected; Ghost Mode returns `[]` |
| **MemberNote** | Create/edit/pin/lock; edit-while-locked rejected; unlock then edit succeeds; empty content rejected; soft-delete (PIN); Ghost Mode returns `[]` |
| **Cycle detection** | Direct self-reference (A→A); indirect cycle (A→B→A); valid 3-level chain; depth > 20 rejected |
| **SP DTO** | `SpMemberContent.Archived` maps from `IsArchived`, not `MemberStatus` |

---

### 11. Migration

One EF Core migration covering:

- 7 new columns on `Member` (`IsPinned`, `IsArchived`, `IsUntracked`, `ExtraImages`, `PreventFrontNotification`, `ReceiveBoardNotifications`, `SpMemberId`)
- 2 new columns on `FrontHistory` (`CustomStatusId`, `Comment`)
- New `FrontStatuses` table with `HasData` seed (10 rows, stable GUIDs)
- New `BoardMessages` table
- New `MemberNotes` table
- FK: `FrontHistory.CustomStatusId → FrontStatus.Id` (nullable, no cascade delete — preserves front history if status later soft-deleted)
- FK: `BoardMessage.MemberId → Member.Id`
- FK: `MemberNote.MemberId → Member.Id`
- `HasQueryFilter` additions in `PluralHostContext` for `BoardMessage` and `MemberNote`
- `ValueConverter` + `ValueComparer` for `Member.ExtraImages` in `PluralHostContext`

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
