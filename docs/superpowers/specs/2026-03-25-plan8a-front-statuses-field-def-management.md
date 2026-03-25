# Spec: Front Status Management UI + Field Definition Edit/Delete

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Two connector-gap fixes before next implementation stage

---

## Overview

Two related UI gaps identified during a frontend/backend connector audit:

1. `FrontStatusController` has full CRUD endpoints but zero frontend callers — the entire feature is unreachable from the UI.
2. `FieldsController` exposes `PATCH /api/fields/{id}` and `DELETE /api/fields/{id}` with no frontend callers — field definitions can be created but never edited or removed.

This spec covers the minimal UI to close both gaps.

---

## Feature 1 — Statuses Tab on SystemPage

### Location

New 4th tab on `SystemPage`, after Groups / Buckets / Tokens.

### Layout

Flat list of status cards. Same structural pattern as the existing Buckets and Groups tabs: list rows with a circular `+` add button in the header, each row rendered as a dark card.

### Backend change — return all statuses to owner

`FrontStatusController.ListAsync` currently filters with `.Where(s => !s.IsHidden)`. This is correct for a public/front-logging context but wrong for the admin management UI — the owner needs to see hidden statuses in order to manage them.

`ListAsync` must be updated to return **all non-deleted statuses** (remove the `IsHidden` filter). The hidden-status display is handled client-side in the UI.

The existing `GetAll_ExcludesHiddenStatuses` test must be updated to reflect the new behavior (owner sees all).

### Card anatomy

Each card row contains:
- **Color dot** (10px circle, `status.color` or a neutral fallback)
- **Label** (flex-fills the remaining width)
- **`default` badge** — shown only when `status.isDefault === true`; muted border style, not accent-colored
- **Hidden state** — when `status.isHidden === true`, the entire card is dimmed to ~38% opacity and the label is struck through; the badge reads `default · hidden`
- **Edit button** (pencil icon) — always present on every row
- **Delete button** (trash icon, `--color-danger`) — present only on non-default statuses

### Edit sheet (`FrontStatusSheet`)

New bottom sheet component, same structure as `BucketSheet` / `GroupSheet`.

Fields:
- **Label** — text input, required
- **Color** — color picker (hex input or swatch grid, consistent with existing color pickers in GroupSheet/BucketSheet)
- **Hidden toggle** — boolean toggle; label reads "Hidden — exclude from front logging"

For default statuses, the sheet includes a read-only note: _"Default statuses cannot be deleted — only hidden."_ No delete button in the sheet.

For custom statuses, the sheet includes a **Delete** button at the bottom, styled with `--color-danger`. Tapping triggers a PIN confirmation sheet (same pattern as member deletion in `AccessTab`).

### Create flow

`+` button opens `FrontStatusSheet` in create mode (empty fields, no delete button, no "default" note).

### Backend mapping

| Action | Endpoint |
|--------|----------|
| List (all, including hidden) | `GET /api/front-statuses` — after removing IsHidden filter |
| Create | `POST /api/front-statuses` `{ label, color }` |
| Edit (label/color/hidden) | `PATCH /api/front-statuses/{id}` `{ label?, color?, isHidden? }` |
| Delete (custom only, PIN-gated) | `DELETE /api/front-statuses/{id}` `{ pin }` in request body |

### Security note

`DELETE /api/front-statuses/{id}?pin=...` currently passes the PIN as a query string (query strings appear in server logs, browser history, and Referer headers). This spec migrates `FrontStatusController.DeleteAsync` to `[FromBody] PinRequest body`.

Note: `TokensController` already uses `[FromBody] PinRequest` — that fix shipped previously and is not in scope here.

### API module

New file: `src/PluralHost.Web/src/api/frontStatuses.ts`

Exports: `listStatuses`, `createStatus`, `updateStatus`, `deleteStatus`

### Query keys

`['front-statuses']` — invalidated on create, update, delete, and hidden-toggle mutations.

---

## Feature 2 — Field Definition Edit/Delete in SpecsTab

### Location

`src/PluralHost.Web/src/components/tabs/SpecsTab.tsx`

### Current state

Each field definition row has two zones:
- **Header row** — label (uppercase, muted), no actions
- **Value row** — member's current value, click to edit inline; has an existing **trash icon** that deletes _this member's value_ for the field (calls `DELETE /api/members/{id}/fields/{fieldId}` — a per-member operation)

### Change

Add a `···` (three-dot) action button to the **header row**, right-aligned, styled in `--color-primary` (lime). Tapping opens an action sheet with two options:

1. **Edit definition** — opens a small bottom sheet with a label text input (pre-filled). On save, calls `PATCH /api/fields/{id}` and invalidates `['field-defs']`. No type change in this UI (field type is set at creation; changing type post-creation is destructive and out of scope).

2. **Delete definition** — shows a confirmation bottom sheet: _"Delete '[label]'? This removes the field from all members and cannot be undone."_ On confirm, calls `DELETE /api/fields/{id}` and invalidates both `['field-defs']` and `['member-fields', memberId]`.

**Distinction from existing trash button:** The existing trash icon on the value row removes only _this member's value_ (the `CustomFieldValue` row). The new `···` > Delete definition removes the _field definition itself_ globally for all members (`CustomField` soft-delete). Both actions remain; they operate on different resources.

### Action sheet implementation

Use the existing `BottomSheet` component. The action sheet is two tappable rows (edit / delete), consistent with the pattern already used in `AccessTab` and `CreateMemberSheet`.

### Backend mapping

| Action | Endpoint |
|--------|----------|
| Edit label | `PATCH /api/fields/{id}` `{ label }` |
| Delete definition | `DELETE /api/fields/{id}` (no PIN — field deletion is not gated) |

### Notes

- Deleting a field definition is a soft-delete (`deleted_at` set on the `CustomField` row). Existing `MemberFieldValue` rows are not deleted — they become orphaned and invisible until the field is restored (owner-only, not exposed in UI).
- The `PATCH` endpoint accepts `label`, `fieldType`, `sortOrder`, and `privacyTier` — only `label` is exposed in this UI. Type and sort changes are out of scope.

---

## Out of Scope

- Front status reordering (drag-to-reorder like Buckets)
- Field definition type changing after creation
- Restoring soft-deleted field definitions from the UI
- Share token / public-facing front status display
- `TokensController` PIN fix (already completed in a prior session)

---

## Files Touched

**New files:**
- `src/PluralHost.Web/src/api/frontStatuses.ts`

**Modified files:**
- `src/PluralHost.Web/src/pages/SystemPage.tsx` — add Statuses tab + `FrontStatusSheet`
- `src/PluralHost.Web/src/pages/SystemPage.module.css` — status card styles (reuse existing patterns)
- `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx` — add `···` button + action sheet
- `src/PluralHost.Api/Controllers/FrontStatusController.cs` — remove `IsHidden` filter from ListAsync; move PIN from query string to request body in DeleteAsync
- `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs` — update `GetAll_ExcludesHiddenStatuses` test; update all `DeleteAsync` call sites from raw `string` to `new PinRequest("1234")`

---

## Acceptance Criteria

- [ ] Statuses tab appears as 4th tab on SystemPage
- [ ] All 10 seeded statuses listed on first load, including any that are hidden
- [ ] Create: new status appears in list after save
- [ ] Edit: label/color/hidden changes persist after save
- [ ] Default statuses show badge, no delete button, "cannot be deleted" note in sheet
- [ ] Hidden statuses dimmed + struck through in list
- [ ] Custom status delete: PIN confirmation, item removed from list on success
- [ ] PIN sent in request body (not query string) for status delete
- [ ] SpecsTab field def rows show `···` button
- [ ] Edit definition: label update persists, all member instances reflect new label
- [ ] Delete definition: confirmation shown, field removed from SpecsTab after confirm
- [ ] Existing per-member value trash button unaffected
- [ ] All existing tests pass; `FrontStatusControllerTests` updated for new list behavior and PIN body
