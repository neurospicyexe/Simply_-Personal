# Plan 7b -- Groups Management & Privacy Buckets

**Date:** 2026-03-22
**Status:** Approved for implementation

---

## Overview

A new "System" page (5th nav entry) with two tabs: **Groups** and **Buckets**. Together they give the owner a central place to organize system members by group membership and visibility tier -- replacing the per-alter privacy configuration scattered across individual member detail pages.

This plan also migrates the backend privacy model from a fixed 4-value enum (`MemberPrivacy`) to a first-class `PrivacyBucket` entity, enabling user-defined custom tiers alongside the four defaults.

**Out of scope (future revisit):** Share token integration per bucket ("assigned friends" -- external people assigned to a bucket to control what they can see via share links).

---

## Navigation

- A fifth entry, labeled **System**, is added to `BottomNav` between Members and History.
- Route: `/system`
- The page renders two tabs via the existing `TabBar` component: **Groups** (default) and **Buckets**.

---

## Groups Tab

### List View

- Scrollable list of group cards: color swatch, name, member count.
- Lucide `Plus` button (top-right or FAB) to create a new group.
- Empty state: "No groups yet. Tap + to create one."

### Group Detail (Bottom Sheet)

Opens via `BottomSheet` when a card is tapped or on create.

Fields:
- **Name** -- inline text input, required.
- **Color** -- color picker (same component as `CreateMemberSheet`).

Member assignment section:
- Search bar at top (live filter by name/display name).
- Full member list below. Members already in this group have a highlighted row (lime accent + checkmark).
- Tap any row to toggle membership in/out of the group.

Actions:
- **Save** -- patches affected members via `PATCH /api/members/{id}` with updated `parentIds`.
- **Delete** -- Lucide `Trash2`; requires a single confirm step (no Gatekeeper PIN needed for groups). Calls `DELETE /api/groups/{id}`.

### Backend

No new endpoints required. The `Group` entity and `GET/POST/DELETE /api/groups` already exist. Member-to-group assignment uses `Member.ParentIds` (comma-separated GUIDs), updated via the existing `PATCH /api/members/{id}` endpoint.

---

## Buckets Tab

### List View

- Scrollable list of bucket cards: emoji, color bar, name, member count.
- Four default buckets shown first (non-removable), then user-created buckets.
- Lucide `Plus` button to create a custom bucket.
- Empty custom section: defaults always present; no empty state needed.

### Bucket Detail (Bottom Sheet)

Opens via `BottomSheet` when a card is tapped or on create.

Fields:
- **Name** -- text input, required, max 150 chars.
- **Description** -- textarea, optional, max 500 chars.
- **Emoji** -- single grapheme cluster input, optional.
- **Color** -- color picker.

Member assignment section (identical pattern to Groups):
- Live search bar.
- Full member list; members in this bucket highlighted (lime accent + checkmark).
- Tap to toggle bucket membership.

Actions:
- **Save** -- `PUT /api/buckets/{id}` for edits; `POST /api/buckets` for new.
- **Delete** -- disabled (greyed out, tooltip: "Default buckets cannot be removed") on the 4 defaults. Enabled on custom buckets with a confirm step.
- **Reorder** -- custom buckets can be reordered via up/down arrow buttons (SortOrder update). Defaults are always first, in fixed order.

Footer note on the tab: *"Share token integration coming soon."*

---

## Backend Changes

### New Entity: `PrivacyBucket`

```
PrivacyBucket
  Id           Guid (PK)
  Name         string (required, max 150)
  Description  string (optional, max 500)
  Emoji        string (optional, max 10)
  Color        string (optional, hex)
  SortOrder    int
  IsDefault    bool
  DeletedAt    DateTime? (soft-delete; defaults cannot be soft-deleted)
  CreatedAt    DateTime
  UpdatedAt    DateTime
```

Seeded defaults (IsDefault = true):

| Name    | SortOrder | Emoji |
|---------|-----------|-------|
| Public  | 0         | 🌐    |
| Friend  | 1         | 🤝    |
| Trusted | 2         | 💛    |
| Private | 3         | 🔒    |

### Member Migration

- `Member.PrivacyTier` (`MemberPrivacy` enum) replaced with `Member.BucketId` (Guid FK → `PrivacyBucket`).
- EF Core migration maps existing enum values to seeded bucket IDs before dropping the column.
- `Member.BucketId` is non-nullable after migration (defaults to Public bucket if unset during migration).

### Visibility Service

`ITokenVisibilityService.FilterByPermission` currently compares enum int casts. Replaced with `SortOrder` comparison:

```
member.Bucket.SortOrder < token.MinBucketSortOrder
```

`AccessToken` gains a `MinBucketSortOrder` int column (replaces `TokenPermission` enum). Existing tokens migrated: `ReadFrontOnly=0 → -1`, `Public=1 → 0`, `Friend=2 → 1`, `Trusted=3 → 2`.

### SP Compat (`SpMembersController`)

- `private: true` → assign member to Private bucket (SortOrder 3).
- `private: false` + currently Private → assign to Public bucket (SortOrder 0).
- `private: false` + currently non-Private → leave unchanged.

### New Endpoints

```
GET    /api/buckets          -- list all non-deleted buckets (owner)
POST   /api/buckets          -- create custom bucket
PUT    /api/buckets/{id}     -- update bucket (name/description/emoji/color/sortOrder)
DELETE /api/buckets/{id}     -- soft-delete (returns 400 if IsDefault = true)
PUT    /api/buckets/reorder  -- update SortOrder for custom buckets (body: [{id, sortOrder}])
```

Member assignment uses the existing `PATCH /api/members/{id}` with a `bucketId` field.

---

## Error Handling

- Attempt to delete a default bucket → `400 Bad Request` with message "Default buckets cannot be removed."
- Attempt to set `BucketId` to a deleted or non-existent bucket → `400 Bad Request`.
- Attempt to set `SortOrder` that conflicts with a default bucket's reserved range → renumber custom buckets starting at 4.
- All Ghost Mode rules apply: bucket/member queries return empty arrays when `IsFrozen = true`.

---

## Testing

### Backend (xUnit)

- `PrivacyBucketTests` -- entity validation (name required, soft-delete blocked on defaults).
- `BucketsControllerTests` -- CRUD, delete-default-returns-400, reorder.
- `TokenVisibilityServiceTests` -- updated to use SortOrder comparison; existing test cases preserved with mapped values.
- `SpMembersControllerTests` -- private flag mapping to bucket IDs.
- Migration smoke test -- all existing members have a non-null `BucketId` after migration.

### Frontend (Vitest)

- `SystemPage` renders Groups and Buckets tabs.
- Group detail sheet: member toggle updates `parentIds` correctly.
- Bucket detail sheet: delete disabled on defaults; enabled on custom.
- Member list search filters correctly.

---

## Future Work

- **Share token per bucket** -- tokens reference a specific bucket; external "friends" assigned to a bucket see only that bucket's members via share link.
- **Bucket reorder drag-and-drop** -- upgrade arrow buttons to drag handles once interaction complexity justifies it.
