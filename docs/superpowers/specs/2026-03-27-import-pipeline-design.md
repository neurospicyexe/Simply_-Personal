# Import Pipeline Design Spec
# SP JSON Upload + PK Live Pull

**Date:** 2026-03-27
**Supersedes:** `2026-03-16-plan4-import-pipeline.md`

---

## Goal

Allow the owner to import their existing system data from Simply Plural (SP) and PluralKit (PK) into PluralHost. SP uses JSON file upload (no credentials required). PK uses a session-only token for a live API pull. Both support member data, avatars, front history, and (SP only) custom fields.

---

## Architecture

### Backend

**New files:**
- `src/PluralHost.Api/Controllers/ImportController.cs` — two endpoints
- `src/PluralHost.Api/Services/ImportService.cs` + `IImportService` — shared member upsert, conflict resolution, history import
- `src/PluralHost.Api/Services/AvatarDownloadService.cs` + `IAvatarDownloadService` — SSRF-safe HTTP avatar fetch
- `src/PluralHost.Api/Dto/ImportDtos.cs` — request/response DTOs

**No migrations required.** `SpMemberId`, `PkId`, `Birthday` already exist on `Member`. `SpFieldId` already exists on `CustomField`. `PrivacyTier` references in the old spec are replaced with `BucketId` throughout.

### Frontend

**Modified:**
- `src/PluralHost.Web/src/pages/SettingsPage.tsx` — new collapsible "Import" section
- `src/PluralHost.Web/src/pages/SettingsPage.module.css` — import card styles

**New:**
- `src/PluralHost.Web/src/api/import.ts` — `importSp(payload)` and `importPk(payload)`

---

## API Endpoints

Both require `[Authorize]`.

### `POST /api/import/simply-plural`

**Request body** (`Content-Type: application/json`):
```json
{
  "conflictStrategy": "merge_prefer_existing",
  "includeCustomFields": true,
  "includeFrontHistory": true,
  "includeAvatars": true,
  "members": [ { "id": "sp-mongo-id", "content": { ... } } ],
  "customFields": [ { "id": "sp-mongo-id", "content": { "name": "Role", "order": 0 } } ],
  "frontHistory": [ { "id": "...", "content": { "startTime": 1710000000000, "endTime": 1710003600000, "member": "sp-mongo-id" } } ]
}
```

`frontHistory` may be omitted or empty if `includeFrontHistory` is false.

### `POST /api/import/plural-kit`

**Request body**:
```json
{
  "token": "pk-token-string",
  "conflictStrategy": "merge_prefer_existing",
  "includeFrontHistory": true,
  "includeAvatars": true
}
```

Backend fetches:
- `GET https://api.pluralkit.me/v2/systems/@me/members` — `Authorization: {token}`
- `GET https://api.pluralkit.me/v2/systems/@me/switches?limit=100` — if `includeFrontHistory: true`

Token is used for the outbound HTTP call only. It is **never written to the database**.

### Response (both endpoints)

```json
{
  "created": 12,
  "updated": 3,
  "skipped": 1,
  "errors": [
    { "sourceId": "abc123", "name": "Harry", "reason": "Name is blank" }
  ],
  "avatarsDownloaded": 11,
  "avatarsFailed": 1,
  "frontHistoryImported": 47
}
```

---

## Conflict Strategies

| Strategy | Behaviour |
|---|---|
| `merge_prefer_existing` | Only fill fields that are currently null/empty — default, safest |
| `overwrite` | Imported data wins on all fields the import provides |
| `skip` | If a match exists, leave it completely unchanged |
| `merge_prefer_imported` | Imported wins on any field it has a non-null value for |
| `duplicate` | Always create a new member regardless of matches |

---

## Member Matching

- **SP:** match by `Member.SpMemberId = import.id`
- **PK:** match by `Member.PkId = import.uuid`
- No match → create new member
- When SP export contains `content.pkId`, set `Member.PkId` as a free cross-link

---

## Field Mappings

### SP → Member

| SP field | PluralHost field | Notes |
|---|---|---|
| `id` | `SpMemberId` | Match key |
| `content.pkId` | `PkId` | Cross-link if present |
| `content.name` | `Name` | Required — skip member if blank |
| `content.desc` | `Description` | |
| `content.pronouns` | `Pronouns` | |
| `content.color` | `Color` | Prepend `#` if missing |
| `content.avatarUrl` | `AvatarPath` | Download → `secure_uploads/` if `includeAvatars` |
| `content.private: true` | `BucketId = PrivacyBucket.PrivateId` | |
| `content.private: false` | `BucketId = PrivacyBucket.PublicId` | Only if currently Private; otherwise leave unchanged |
| `content.archived` | `IsArchived` | |
| `content.preventsFrontNotifs` | `PreventFrontNotification` | |
| `content.receiveMessageBoardNotifs` | `ReceiveBoardNotifications` | |
| `content.info` | `CustomFieldValue` entries | Only if `includeCustomFields: true` |

### PK → Member

| PK field | PluralHost field | Notes |
|---|---|---|
| `uuid` | `PkId` | Match key |
| `name` | `Name` | Required — skip member if blank |
| `display_name` | `DisplayName` | |
| `pronouns` | `Pronouns` | |
| `color` | `Color` | Prepend `#` if missing |
| `avatar_url` | `AvatarPath` | Download → `secure_uploads/` if `includeAvatars` |
| `description` | `Description` | |
| `birthday` | `Birthday` | Store as `"YYYY-MM-DD"` string |
| `privacy.visibility = "private"` | `BucketId = PrivacyBucket.PrivateId` | |
| `privacy.visibility = "public"` | `BucketId = PrivacyBucket.PublicId` | |

---

## SP Custom Fields (`includeCustomFields: true`)

SP exports a `customFields` array:
```json
{ "id": "mongoObjectId", "content": { "name": "Role", "order": 0, "private": false } }
```

Logic:
1. For each SP field definition: find `CustomField` by `SpFieldId` match, or create new (soft-deleted included via `IgnoreQueryFilters`).
2. For each member's `content.info` dict: upsert `CustomFieldValue` with `BucketId = PrivacyBucket.PrivateId` (safest default).

PK has no custom fields — not applicable.

---

## Front History Import

### SP front history

SP exports a `frontHistory` array where each entry has:
- `content.member` — SP member ID (string)
- `content.startTime` — Unix timestamp ms
- `content.endTime` — Unix timestamp ms (null/0 = ongoing)

Import logic:
1. Build a map `SpMemberId → Member.Id` from the current import batch + existing members.
2. For each history entry: resolve member, create `FrontHistory` with the default `FrontStatus` (`IsDefault = true`). Convert `startTime`/`endTime` from Unix ms to `DateTime.UtcNow` equivalent.
3. Skip entries where the SP member ID cannot be resolved — add to `errors` list.
4. Skip duplicate entries where a `FrontHistory` record with the same `MemberId` + `StartTime` already exists (exact UTC match).

> **Implementation note:** Verify SP export's exact field names for front history against a real export before implementing. The structure above (`content.startTime`, `content.endTime`, `content.member`) matches SP API v1 conventions but the file export may differ.

### PK switches

PK's `/v2/systems/@me/switches` returns:
```json
[{ "id": "uuid", "timestamp": "2024-03-10T12:00:00Z", "members": ["pk-uuid-1", "pk-uuid-2"] }]
```

Each switch represents a front change. Import as `FrontHistory` entries using `switch.timestamp` as `StartTime`. `EndTime` = next switch's timestamp (or null for the most recent). Members array may contain multiple members — create one `FrontHistory` row per member per switch.

Pagination: fetch up to 1000 switches using PK's cursor pattern — `?limit=100`, then repeat with `?limit=100&before={oldest_timestamp}` until fewer than 100 results are returned or 10 pages fetched (whichever comes first).

---

## Avatar Download — SSRF Protection

- Reject non-HTTP/HTTPS URLs
- Reject private IP ranges: `10.x`, `172.16–31.x`, `192.168.x`, `127.x`, `169.254.x`
- Max size: 5 MB
- Validate `Content-Type`: must be `image/jpeg`, `image/png`, `image/gif`, or `image/webp`
- Validate magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46`, WebP `52 49 46 46…57 45 42 50`
- Save as `{Guid}.{ext}` in `secure_uploads/`
- Failures are non-fatal: member still imports, `avatarsFailed` counter increments

---

## Frontend UI

New collapsible "Import" section in `SettingsPage`, below Security.

### SP card

- Textarea: "Paste SP export JSON"
- File button: reads `.json` file and populates textarea
- Checkboxes (all on by default): "Import custom fields", "Import front history", "Download avatars"
- Conflict strategy: pill showing "Safe merge" + "Advanced ▾" toggle revealing full `<select>` with all 5 options
- "Import from Simply Plural" button — disabled until JSON present
- Result card on completion: created / updated / skipped / errors list / avatars / history counts

### PK card

- Password input: "PluralKit token" — helper text "Used once, never stored"
- Checkboxes: "Import front history", "Download avatars"
- Same conflict strategy toggle
- "Import from PluralKit" button — disabled until token present
- Same result card pattern

Both cards show a loading spinner during import. Per-member errors surface in a collapsed list below the summary counts.

---

## Testing

**Backend:**
- `ImportControllerTests` — SP: valid request returns 200 with result; invalid JSON returns 400; missing name skips member; conflict strategies (overwrite / skip / merge_prefer_existing); custom fields upserted; front history imported; avatar failure non-fatal
- `ImportControllerTests` — PK: valid token + mock HTTP returns 200; token not persisted to DB; switches imported correctly
- `AvatarDownloadServiceTests` — private IP rejected; oversized file returns null; wrong magic bytes returns null; valid JPEG downloaded and saved

**Frontend:**
- `SettingsPage` Import section renders both cards
- SP import button disabled when textarea empty; enabled with JSON
- PK import button disabled when token empty
- Result card displays after successful import

---

## Out of Scope

- Real-time sync via stored API tokens
- Import preview / dry-run mode
- Rollback of a completed import
- SP or PK group import
- SP front notifications import
