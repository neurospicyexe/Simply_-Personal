# Design Spec: JWT Fix, Custom Fields, and Global Journals

**Date:** 2026-03-15
**Plan sequence:** Plan 3 of 5
**Status:** Reviewed and approved — ready for implementation planning

---

## Context

Plan 2 delivered privacy tiers and share tokens. Plan 3 adds three things in dependency order:

1. **JWT fix** — `AuthService.GenerateTokenAsync` currently throws `NotImplementedException`, making login non-functional. Fix this first so every subsequent task can be manually tested.
2. **Custom fields** — a programmable "Additional Info" tab per member, with per-value privacy tiers and share-token visibility.
3. **Global journals** — system-level diary entries with a simple private/public toggle and share-token access.

---

## Scope

### 1. JWT Fix

`AuthService.GenerateTokenAsync` generates a signed JWT using `JwtSecurityTokenHandler`. Claims: `sub` (fixed string `"owner"`), `jti` (new `Guid.NewGuid().ToString()`), `iat` and `exp` (UTC Unix timestamps). The signing key, issuer, and audience come from `IConfiguration` — the same values `Program.cs` already validates at startup.

The existing `AuthServiceTests` already contain fully-written tests that currently fail because the implementation throws `NotImplementedException`. Implementing `GenerateTokenAsync` makes those tests pass — no new test names are needed, no test renames required.

No changes to `AuthController` or `Program.cs`.

---

### 2. Schema Changes

#### CustomField (new entity)

| Column | Type | Notes |
|---|---|---|
| `Id` | Guid | PK |
| `Label` | string | Required |
| `FieldType` | enum | `Text / Multiline / Number / Date / Boolean` |
| `SortOrder` | int | Default 0 |
| `CreatedAt` | DateTime | |
| `UpdatedAt` | DateTime | |
| `DeletedAt` | DateTime? | Soft-delete |

No Ghost Mode filter — definitions are owner-only and never exposed publicly. Soft-delete filter only.

#### CustomFieldValue (new entity)

| Column | Type | Notes |
|---|---|---|
| `Id` | Guid | PK |
| `FieldId` | Guid | FK → `CustomField.Id`, no cascade delete |
| `MemberId` | Guid | FK → `Member.Id`, no cascade delete |
| `Value` | string | Serialized; empty string for Boolean `false` / unset |
| `PrivacyTier` | MemberPrivacy | Default `Public` |
| `CreatedAt` | DateTime | |
| `UpdatedAt` | DateTime | |
| `DeletedAt` | DateTime? | Soft-delete |

Unique constraint on `(FieldId, MemberId)`. Soft-delete filter only — Ghost Mode is already enforced upstream at the Member level.

**Value serialization by type:**
- `Text` / `Multiline` — raw string
- `Number` — string representation of decimal (e.g. `"42"`, `"3.14"`)
- `Date` — ISO 8601 date string (e.g. `"2000-01-15"`)
- `Boolean` — `"true"` or `"false"`

**Cascade soft-delete:** When a `CustomField` is soft-deleted, all its `CustomFieldValue` rows are soft-deleted in the same operation. This is done inline in `FieldsController.DeleteAsync`: load all `CustomFieldValue` rows for the field using `IgnoreQueryFilters()` where `DeletedAt == null`, call `.SoftDelete()` on each, call `.SoftDelete()` on the field, then `SaveChangesAsync()`. No separate service method required. Restoring a field does not automatically restore values — values must be individually restored if needed.

#### JournalEntry (new entity)

| Column | Type | Notes |
|---|---|---|
| `Id` | Guid | PK |
| `Title` | string? | Nullable |
| `Content` | string | Required |
| `IsPrivate` | bool | Default `true` |
| `CreatedAt` | DateTime | |
| `UpdatedAt` | DateTime | |
| `DeletedAt` | DateTime? | Soft-delete |

No Ghost Mode filter on `JournalEntry`. Ghost Mode is enforced at the controller level in the share endpoint before any DB access (same pattern as `ShareController`).

Both `CustomField` and `CustomFieldValue` inherit `BaseEntity` (same as all existing domain entities), gaining `Id`, `CreatedAt`, `UpdatedAt`, `DeletedAt`, and the `SoftDelete()` / `Restore()` methods. `JournalEntry` also inherits `BaseEntity`.

All three new entities require a `HasQueryFilter(x => x.DeletedAt == null)` registration in `PluralHostContext.OnModelCreating` — same pattern as `MemberNote`, `FrontStatus`, and `BoardMessage`. Without this, soft-deleted rows silently appear in all queries.

---

### 3. Custom Field Definitions API (owner-side, `[Authorize]`)

```
GET    /api/fields                  → list all field definitions (including soft-deleted)
POST   /api/fields                  → create a field
PATCH  /api/fields/{id}             → update label or sortOrder
DELETE /api/fields/{id}             → soft-delete field + cascade soft-delete all values (idempotent — 200 OK if already deleted)
```

**`POST /api/fields` request:**
```json
{ "label": "Age", "fieldType": "Number", "sortOrder": 0 }
```
`label` required. `fieldType` required. `sortOrder` defaults to 0 if omitted.

**`GET /api/fields` response:** All definitions ordered by `SortOrder ASC`, then `CreatedAt ASC`. Includes soft-deleted entries (owner needs them for management). Each entry includes `id`, `label`, `fieldType`, `sortOrder`, `createdAt`, `updatedAt`, `deletedAt`.

**`PATCH /api/fields/{id}` request:** Partial — only `label` and `sortOrder` are patchable. `fieldType` is immutable after creation; if `fieldType` is included in the request body, return 400 — "FieldType cannot be changed after creation". Returns 404 if the field is not found or is soft-deleted (soft-deleted fields cannot be patched — delete and recreate instead).

---

### 4. Custom Field Values API (owner-side, `[Authorize]`)

```
GET    /api/members/{memberId}/fields               → all fields with member's values (blanks included)
PUT    /api/members/{memberId}/fields/{fieldId}     → upsert value + privacyTier
DELETE /api/members/{memberId}/fields/{fieldId}     → soft-delete value (clear field)
```

**`GET /api/members/{memberId}/fields` response:** Returns all non-deleted `CustomField` definitions, each annotated with the member's current value and privacy tier (null value and default privacy tier if no row exists). Returns 404 if `memberId` does not exist or is soft-deleted.

**`PUT /api/members/{memberId}/fields/{fieldId}` request:**
```json
{ "value": "25", "privacyTier": "Trusted" }
```
Returns 404 if `memberId` is not found, or if `fieldId` is not found. Returns 400 if `CustomField.DeletedAt != null` (cannot write a value to a soft-deleted field definition) — error: "Field has been deleted".

Upsert logic: the implementation must use `IgnoreQueryFilters()` to find an existing `CustomFieldValue` row (including soft-deleted rows) for the `(FieldId, MemberId)` pair, because the unique constraint covers soft-deleted rows. If found (even if soft-deleted): call `.Restore()` to clear `DeletedAt`, then update `Value` and `PrivacyTier`, then `SaveChangesAsync()`. If not found: insert a new row.

Returns the saved value row:
```json
{ "id": "...", "fieldId": "...", "memberId": "...", "value": "25", "privacyTier": "Trusted", "createdAt": "...", "updatedAt": "..." }
```

**Validation:** Server validates that `value` is consistent with the field's `FieldType` before saving (e.g., `Number` type rejects `"banana"`). Returns 400 on type mismatch.

---

### 5. Global Journals API (owner-side, `[Authorize]`)

```
GET    /api/journals            → list all entries (most recent first, soft-deleted excluded)
POST   /api/journals            → create entry
PATCH  /api/journals/{id}       → update title / content / isPrivate
DELETE /api/journals/{id}       → soft-delete
```

**`POST /api/journals` request:**
```json
{ "title": "Today", "content": "...", "isPrivate": false }
```
`content` required. `title` optional (null if omitted). `isPrivate` defaults to `true` if omitted.

**`GET /api/journals` response:** Ordered `CreatedAt DESC`. Each entry includes `id`, `title`, `content`, `isPrivate`, `createdAt`, `updatedAt`. Returns at most the 500 most recent entries (`.Take(500)`) as a safety limit — full pagination is a known deferral.

---

### 6. Share Token Integration

#### `GET /share/{token}` — updated member response

Each member in the response gains a `customFields` array:
```json
{
  "name": "Ember",
  "displayName": null,
  "customFields": [
    { "label": "Age", "fieldType": "Number", "value": "25" },
    { "label": "Role", "fieldType": "Text", "value": "Protector" }
  ]
}
```

Only values where `(int)value.PrivacyTier < (int)token.Permission` are included. This is an inline expression in the controller query — **not** a call to `ITokenVisibilityService.FilterByPermission` (which takes `IQueryable<Member>` and cannot be applied to `CustomFieldValue.PrivacyTier`). The expression is intentionally identical to the logic inside `FilterByPermission` — any future change to the visibility rule must be applied to both places. Values above the token's tier are silently omitted — no 403, no indication they exist.

`ReadFrontOnly` tokens never reach the member list path — they return early with only `currentFront`. The `currentFront` response shape (`{ name, displayName, color }`) does **not** gain a `customFields` array. This is intentional: ReadFrontOnly tokens expose only current fronter names and colors, not member details. The existing code already restricts `currentFront` to `PrivacyTier == MemberPrivacy.Public` fronters only.

The `CustomField.DeletedAt` filter applies — soft-deleted fields are excluded from the share response even if a value row exists.

#### `GET /share/{token}/journals` — new endpoint

```
GET /share/{token}/journals
```

Validation order (same Ghost Mode-first pattern as all share endpoints):
1. Ghost Mode → 200 OK with `[]` (matches the existing `GET /share/{token}` frozen response — GET share endpoints return empty, not 204)
2. Token validation via `ResolveTokenAsync` → 401 "Token has expired" or "Token is invalid"
3. `ReadFrontOnly` token → 403 "Not permitted"
4. Return `JournalEntry` rows where `IsPrivate = false` and `DeletedAt = null`, ordered `CreatedAt DESC`

Response per entry: `{ id, title, content, createdAt }`. `isPrivate` is omitted from the share response (always `false` for entries returned here — including it would be redundant). `updatedAt` is omitted from the share response — token holders receive the entry as published, not its edit history.

---

### 7. Error Handling

| Scenario | Response |
|---|---|
| `POST /api/fields` — missing label | 400 — "Label is required" |
| `POST /api/fields` — missing fieldType | 400 — "FieldType is required" |
| `PATCH /api/fields/{id}` — not found or soft-deleted | 404 |
| `PATCH /api/fields/{id}` — `fieldType` in body | 400 — "FieldType cannot be changed after creation" |
| `PUT /api/members/{memberId}/fields/{fieldId}` — type mismatch | 400 — "Value is not valid for field type {type}" |
| `PUT` — field not found or member not found | 404 |
| `PUT` — field is soft-deleted | 400 — "Field has been deleted" |
| `GET /api/members/{memberId}/fields` — member not found | 404 |
| `POST /api/journals` — missing content | 400 — "Content is required" |
| `GET /share/{token}/journals` — ReadFrontOnly token | 403 — "Not permitted" |
| Ghost Mode on GET /share journals | 200 OK — `[]` |

---

### 8. Testing

| Area | Test cases |
|---|---|
| **JWT** | Existing `AuthServiceTests` pass (no new test files needed) |
| **CustomField CRUD** | Create persists; `Label` required; `FieldType` immutable after creation (PATCH with `fieldType` → 400); soft-delete cascades — all value rows have `DeletedAt != null`, values no longer appear in `GET /api/members/{id}/fields`, field row still exists in DB (not hard-deleted); `GET /api/fields` includes soft-deleted definitions; DELETE idempotent — second call returns 200 |
| **CustomFieldValue upsert** | New field creates row; existing field updates row; soft-deleted value row is restored and updated on upsert |
| **CustomFieldValue GET** | Returns all definitions with values; returns blank (null value) for unset fields |
| **Value type validation** | Number rejects non-numeric string; Date rejects invalid date; Boolean rejects non-`"true"`/`"false"` |
| **Share — custom fields** | Public token sees only Public-tier values; Friend token sees Public+Friend; Trusted token sees Public+Friend+Trusted; Private-tier values never returned; soft-deleted field definitions excluded; Ghost Mode → member list is `[]` so no member objects (and therefore no `customFields` arrays) appear in response; ReadFrontOnly → no `customFields` on `currentFront` entries |
| **Journal CRUD** | Create defaults `IsPrivate = true`; patch updates `IsPrivate`; soft-delete only |
| **Share — journals** | Ghost Mode → 200 `[]`; ReadFrontOnly token → 403; valid token returns only `IsPrivate = false` entries; expired token → 401 |

---

### 9. Migration

One EF Core migration covering:
- Add `CustomFields` table
- Add `CustomFieldValues` table with unique constraint on `(FieldId, MemberId)`
- Add `JournalEntries` table

No data migrations required — all new tables.

---

## Out of Scope (Deferred)

| Feature | Plan |
|---|---|
| Simply Plural / PluralKit import pipeline | Plan 4 |
| React Flow mind map, heatmaps, PWA shell | Plan 5 |
| Per-member field extras (fields unique to one alter) | Future |
| Journal tags | Future |
| Restoring soft-deleted field values on field restore | Future |
| Journal pagination (beyond 500-entry safety limit) | Future |
