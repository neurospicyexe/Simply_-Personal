# Plan 6b Design Spec — Avatar Upload, Delete Member, Security Settings

**Date:** 2026-03-21
**Status:** Draft

---

## Goal

Close three gaps that prevent showing the app to others: members have no avatar, there is no way to delete a member, and there is no UI to manage the Gatekeeper PIN or change the login password.

---

## Scope

### Backend (4 endpoints)

**`POST /api/media/upload`** — `[Authorize]`, multipart/form-data.

- Accept one file per request. Reject files over 5 MB with 413.
- Reject any extension not in the allowlist (`jpg`, `jpeg`, `png`, `gif`, `webp`) with 400.
- Validate magic bytes against the claimed type. Reject on mismatch with 400. Expected signatures:
  - JPEG: bytes 0–2 = `FF D8 FF`
  - PNG: bytes 0–3 = `89 50 4E 47`
  - GIF: bytes 0–5 = `47 49 46 38 37 61` or `47 49 46 38 39 61`
  - WebP: bytes 0–3 = `52 49 46 46` (RIFF) AND bytes 8–11 = `57 45 42 50`
- Discard the original filename. Save the file as `{UUID}.{ext}` under `secure_uploads/`.
- Return 200 with `{ "id": "{UUID}.{ext}" }`.
- The existing `GET /api/media/{id}` endpoint already serves files behind auth; no changes needed there.

**`DELETE /api/members/{id}`** — `[Authorize]`, Gatekeeper PIN in request body.

- Body: `{ "pin": "..." }`.
- If the member does not exist (soft-deleted or never created), return 404.
- Verify the PIN via `IGatekeeperService`. Return 403 if verification fails.
- Check `SystemSettings.DeletionCooldownEnd`. If the cooldown has not expired, return 409 with body `{ "cooldownEnd": "<ISO 8601 timestamp>" }`.
- Soft-delete the member (`member.SoftDelete()`).
- Set `SystemSettings.DeletionCooldownEnd = DateTime.UtcNow.AddHours(72)`.
- Return 204.

**`PUT /api/secure/pin`** — `[Authorize]`.

- Body: `{ "currentPin": "...", "newPin": "..." }`. `currentPin` is optional only when no PIN is set.
- If `SystemSettings.GatekeeperPinHash` is null (first-time setup), skip current-PIN verification. If `currentPin` is provided in this case, ignore it.
- If `GatekeeperPinHash` is not null and `currentPin` is null or empty, return 400 (do not attempt verification).
- If `GatekeeperPinHash` is not null and `currentPin` is provided, verify via `IGatekeeperService`. Return 403 if verification fails.
- Validate `newPin`: minimum 4 characters, maximum 64 characters. Return 400 if invalid.
- Hash `newPin` with BCrypt work factor 12. Store in `SystemSettings.GatekeeperPinHash`.
- Return 204.

**`GET /api/secure/status`** — `[Authorize]`.

- Return `{ "pinIsSet": true|false, "deletionCooldownEnd": "<ISO 8601 timestamp>|null" }`.
- `deletionCooldownEnd` is null when no cooldown is active or the cooldown has already expired.
- Allows the frontend to adapt PIN form copy and render the AccessTab cooldown state on initial load without a probe request.

---

### Frontend

#### EssenceTab — Avatar upload

The avatar circle already renders in EssenceTab. The change: add a pencil button overlaid at the bottom-right corner of the avatar circle.

**Upload flow:**

1. User clicks the pencil button.
2. A hidden `<input type="file" accept="image/*">` triggers.
3. On file selection, capture the current `member.avatarId` value as `previousAvatarId`. Then display a client-side preview via `URL.createObjectURL` and show a spinner overlay on the avatar.
4. Call `POST /api/media/upload`.
5. On success, call `PATCH /api/members/{id}` with body `{ "avatarId": "<returned id>" }` to link the new avatar. The field name on the backend DTO is `AvatarId`; the JSON serializes to `avatarId`.
6. Invalidate the `['member', id]` query. The spinner resolves; the avatar renders from the server.
7. On error in step 4 or step 5: revert the displayed avatar to `previousAvatarId` (or the default avatar if null), clear the spinner, and show an inline error message. Note: if step 4 succeeds but step 5 fails, the uploaded file remains in `secure_uploads/` as an orphan. This is accepted behaviour for this plan; no cleanup mechanism is in scope.

**New module:** `src/api/media.ts` — exports `mediaApi.upload(file: File): Promise<{ id: string }>`.

#### AccessTab — Delete member

Add a "Danger Zone" section at the bottom of AccessTab, visually separated by a red-tinted divider.

**Two states:**

- **Normal:** A red "Delete [name]" button. Clicking opens a BottomSheet containing:
  - Warning text: "This will remove [Name] from your system. This action requires your Gatekeeper PIN."
  - A PIN input field (type password).
  - A "Confirm delete" button (destructive style).
  - Submitting calls `DELETE /api/members/{id}` with the PIN in the body.
  - On success: invalidate `['members']`, navigate back to `/members`.
  - On 403: show "Incorrect PIN" inline error, keep the sheet open.
  - On 409: close the sheet, render the cooldown state.

- **Cooldown:** The delete button is absent. In its place: a disabled message — "Deletion available in Xh Xm" — calculated from the `cooldownEnd` timestamp. On mount, AccessTab queries `GET /api/secure/status` and initialises cooldown state from `deletionCooldownEnd`. On a 409 response, it updates cooldown state from the response body. A `setInterval` ticking every 60 seconds recalculates the display string. When the interval fires and `cooldownEnd` is in the past, clear the cooldown state and re-enable the delete button (no page reload required).

#### SettingsPage — Security section

Add a collapsible "Security" section below the logout button. The section collapses to a header with a chevron. It contains two subsections, each independently collapsible.

**Change Password:**

- Fields: current password, new password, confirm new password.
- Inline validation: passwords must match; minimum 8 characters.
- Calls `POST /api/auth/change-password`. This endpoint already exists; it returns 400 when the current password is incorrect (the user is authenticated, so 401 would be misleading). The implementer must confirm the exact status code from `AuthController.cs` before wiring the error handler, and handle whichever code the endpoint actually returns.
- On success: clear all fields, show a brief success message.
- On 400 (or 401 if the existing endpoint uses that): show "Current password is incorrect" inline.

**Gatekeeper PIN:**

- Query `GET /api/secure/status` on mount to determine whether a PIN is already set.
- If no PIN set: label reads "Set PIN". Fields: new PIN, confirm PIN. No current-PIN field.
- If PIN is set: label reads "Change PIN". Fields: current PIN, new PIN, confirm PIN.
- Calls `PUT /api/secure/pin`.
- On success: clear all fields, update local `pinIsSet` state to true, show a brief success message.
- On 403: show "Current PIN is incorrect" inline.

**New module:** `src/api/secure.ts` — exports:
- `secureApi.status(): Promise<{ pinIsSet: boolean; deletionCooldownEnd: string | null }>`
- `secureApi.setPin(body: { currentPin?: string; newPin: string }): Promise<void>`

The existing `POST /api/auth/change-password` call in the auth module stays where it is.

---

## Architecture Notes

### What this plan does not include

- Password recovery (documented: reset via database if locked out; email/OAuth integration deferred).
- Avatar cropping or resizing (upload raw, serve raw).
- Bulk delete or group-scoped delete.

### Security constraints (carry-forward from CLAUDE.md)

- Never hard-delete. The member row remains; `deleted_at` is set.
- PIN always travels in the request body, never in the URL.
- Magic byte validation is mandatory for file uploads.
- The 72h cooldown applies system-wide (one deletion per 72h across all members).

### Extension points

- Password recovery via email or OAuth can be added to `AuthController` and `SettingsPage` independently without touching any code written in this plan.
- Avatar resizing can be added to `POST /api/media/upload` transparently (same response contract).

---

## Files Affected

| File | Change |
|------|--------|
| `src/PluralHost.Api/Controllers/MediaController.cs` | Add `POST /api/media/upload` action |
| `src/PluralHost.Api/Controllers/MembersController.cs` | Add `DELETE /api/members/{id}` action; confirm `PATCH /api/members/{id}` DTO includes `AvatarId` field (add it if absent) |
| `src/PluralHost.Api/Controllers/SecureActionController.cs` | Add `PUT /api/secure/pin` and `GET /api/secure/status` actions |
| `src/PluralHost.Api/Dto/NativeDtos.cs` | Add `UploadResponse`, `DeleteMemberRequest`, `SetPinRequest`, `SecureStatusResponse`; add `AvatarId` to the existing member update DTO if absent |
| `tests/PluralHost.Tests/Controllers/MediaControllerTests.cs` | New test class |
| `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs` | Add delete tests |
| `tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs` | Add PIN and status tests |
| `src/PluralHost.Web/src/api/media.ts` | New — `mediaApi.upload` |
| `src/PluralHost.Web/src/api/secure.ts` | New — `secureApi.status`, `secureApi.setPin` |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx` | Add avatar pencil button + upload flow |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css` | Avatar overlay styles |
| `src/PluralHost.Web/src/components/tabs/AccessTab.tsx` | Add Danger Zone section |
| `src/PluralHost.Web/src/components/tabs/AccessTab.module.css` | Danger Zone styles |
| `src/PluralHost.Web/src/pages/SettingsPage.tsx` | Add collapsible Security section |
| `src/PluralHost.Web/src/pages/SettingsPage.module.css` | Collapsible section styles |
| `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx` | Add upload tests |
| `src/PluralHost.Web/src/__tests__/AccessTab.test.tsx` | Add delete + cooldown tests |
| `src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx` | New — security section tests |
