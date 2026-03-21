# Plan 4 Spec: Import Pipeline (Simply Plural + PluralKit)

## Goal

Allow the owner to import their existing data from Simply Plural (SP) and PluralKit (PK) as JSON, with field-level conflict control and local avatar storage.

---

## Import Method

Both imports accept a raw **JSON body** (`Content-Type: application/json`). The user exports data from the source app/API themselves and pastes it into the request. This keeps credentials out of our system and works offline.

- **SP export**: The Simply Plural app's "Export data" function, or the SP API response. Structure: `{ members, customFields }` where each member is `{ id, content: { ... } }`.
- **PK export**: Response from `GET https://api.pluralkit.me/v2/systems/@me/members` (array of member objects) with a `Authorization: <pk-token>` header. User fetches this themselves and pastes the array.

---

## Conflict Strategies

Both endpoints accept a `conflictStrategy` field:

| Strategy | Behaviour |
|---|---|
| `overwrite` | Imported data wins on all fields the import provides |
| `skip` | If a match exists, leave it completely alone |
| `merge_prefer_existing` | Only fill fields that are currently null/empty — safe for SP→PK layering |
| `merge_prefer_imported` | Imported wins on any field it has a non-null value for |
| `duplicate` | Always create a new member regardless of matches |

Default: `merge_prefer_existing` (safest for layered imports).

---

## Matching Strategy

**SP import:** Match by `Member.SpMemberId = import.id`
**PK import:** Match by `Member.PkId = import.uuid`
No match found → create new member.

When SP has a `pkId` field set, also populate `Member.PkId` at import time (free cross-link).

---

## New Fields Required on `Member`

| Field | Type | Source |
|---|---|---|
| `PkId` | `string?` | PluralKit UUID — match key for PK imports |
| `Birthday` | `string?` | `"YYYY-MM-DD"` format from PK, null if absent |

(`SpMemberId` already exists on `Member`.)

New field on `CustomField`:

| Field | Type | Source |
|---|---|---|
| `SpFieldId` | `string?` | SP MongoDB ObjectId of the field definition — used to match on re-import |

---

## Field Mappings

### SP → Member

| SP field | Our field | Notes |
|---|---|---|
| `id` | `SpMemberId` | Match key |
| `content.pkId` | `PkId` | Cross-link to PK — set if present |
| `content.name` | `Name` | Required; skip member if blank |
| `content.desc` | `Description` | |
| `content.pronouns` | `Pronouns` | |
| `content.color` | `Color` | Prepend `#` if missing |
| `content.avatarUrl` | `AvatarPath` | Download → `secure_uploads/` |
| `content.private: true` | `PrivacyTier = Private` | |
| `content.private: false` | `PrivacyTier = Public` | Only applies if existing tier is not already higher |
| `content.archived` | `IsArchived` | |
| `content.preventsFrontNotifs` | `PreventFrontNotification` | |
| `content.receiveMessageBoardNotifs` | `ReceiveBoardNotifications` | |
| `content.info` | `CustomFieldValue` entries | Only if `includeCustomFields: true` |

### PK → Member

| PK field | Our field | Notes |
|---|---|---|
| `uuid` | `PkId` | Match key |
| `name` | `Name` | Required; skip member if blank |
| `display_name` | `DisplayName` | |
| `pronouns` | `Pronouns` | |
| `color` | `Color` | Prepend `#` if missing |
| `avatar_url` | `AvatarPath` | Download → `secure_uploads/` |
| `description` | `Description` | |
| `birthday` | `Birthday` | Store as string `"YYYY-MM-DD"` |
| `privacy.visibility = "private"` | `PrivacyTier = Private` | |
| `privacy.visibility = "public"` | `PrivacyTier = Public` | |

---

## SP Custom Fields Import (`includeCustomFields: true`)

SP exports include a `customFields` array:
```json
{
  "id": "mongoObjectId",
  "content": { "name": "Role", "order": 0, "private": false }
}
```

Import logic:
1. For each SP field definition: find existing `CustomField` by `SpFieldId` match, or create new.
2. For each member's `info` dict: create/upsert `CustomFieldValue` for each key.
3. All imported custom field values default to `MemberPrivacy.Private` (safest default — owner can adjust).

PK has no custom fields — not applicable.

---

## Avatar Download (`includeAvatars: true`, default `true`)

Security requirements (SSRF/content safety):
- Reject non-HTTP/HTTPS URLs
- Reject private IP ranges: `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `169.254.x` (AWS metadata)
- Max file size: **5 MB**
- Validate `Content-Type` header: must be `image/jpeg`, `image/png`, `image/gif`, or `image/webp`
- Validate magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46`, WebP `52 49 46 46...57 45 42 50`
- Discard original filename; save as `{Guid}.{ext}` in `secure_uploads/`
- Avatar download failures are non-fatal: member is still imported, `avatarError` added to result

---

## Import Result Response

```json
{
  "created": 42,
  "updated": 8,
  "skipped": 3,
  "errors": [
    { "sourceId": "abc123", "name": "Harry", "reason": "Name is blank" }
  ],
  "avatarsFailed": 2,
  "avatarsDownloaded": 39
}
```

---

## API Endpoints

Both require `[Authorize]`.

```
POST /api/import/simply-plural
POST /api/import/plural-kit
```

### SP request body
```json
{
  "conflictStrategy": "merge_prefer_existing",
  "includeCustomFields": true,
  "includeAvatars": true,
  "members": [ { "id": "...", "content": { ... } } ],
  "customFields": [ { "id": "...", "content": { ... } } ]
}
```

### PK request body
```json
{
  "conflictStrategy": "merge_prefer_existing",
  "includeAvatars": true,
  "members": [ { "uuid": "...", "name": "...", ... } ]
}
```

---

## Out of Scope (Plan 4)

- Front history / switch history import
- SP group or PK group import
- Real-time sync via stored API tokens
- Import preview / dry-run mode
- Rollback of a completed import
