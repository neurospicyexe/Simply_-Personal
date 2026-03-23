# Share Token UI — Design Spec

**Date:** 2026-03-23
**Feature:** Share token management UI + Gatekeeper PIN query-string security fix

---

## Overview

Add a frontend UI for creating, copying, and revoking share tokens. Tokens control what a link recipient can see: "Front Only" (current fronters, no member list), or a bucket level (Public / Friend / Trusted / custom). The backend (`GET/POST/DELETE /api/tokens`) is fully implemented; this spec covers all frontend work plus one backend security fix.

---

## Architecture

### New files

| File | Responsibility |
|------|---------------|
| `src/PluralHost.Web/src/api/tokens.ts` | CRUD calls to `/api/tokens` |
| `src/PluralHost.Web/src/types.ts` | Add `AccessToken` interface |
| `src/PluralHost.Web/src/components/TokenSheet.tsx` | Create token bottom sheet |
| `src/PluralHost.Web/src/components/TokenSheet.module.css` | Styles |

### Modified files

| File | Change |
|------|--------|
| `src/PluralHost.Api/Controllers/TokensController.cs` | Move PIN from `[FromQuery]` to `[FromBody]` |
| `src/PluralHost.Api/Controllers/TokensControllerTests.cs` | Update revoke test |
| `src/PluralHost.Web/src/pages/SystemPage.tsx` | Add "Tokens" tab |
| `src/PluralHost.Web/src/components/BucketSheet.tsx` | Replace placeholder with token preview section |

---

## Backend Fix: Gatekeeper PIN in Query String

`DELETE /api/tokens/{tokenValue}` currently takes `?pin=...` as a query parameter. This is a HIGH severity issue (listed in CLAUDE.md) -- query strings appear in server logs, browser history, and Referer headers.

**Fix:** Switch to `[FromBody] PinRequest body` matching the pattern used by other secure actions.

```csharp
// Before
public async Task<IActionResult> RevokeAsync(string tokenValue, [FromQuery] string pin)

// After
public async Task<IActionResult> RevokeAsync(string tokenValue, [FromBody] PinRequest body)
```

`PinRequest` record already exists in `NativeDtos.cs`.

---

## Frontend: AccessToken Type

Add to `src/types.ts`:

```ts
export interface AccessToken {
  tokenValue: string
  label: string | null
  minBucketSortOrder: number   // -1 = ReadFrontOnly
  allowsBoardPosting: boolean
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}
```

---

## Frontend: API Module (`src/api/tokens.ts`)

```ts
export const tokensApi = {
  list: (): Promise<AccessToken[]>
  create: (body: TokenCreatePayload): Promise<AccessToken>
  revoke: (tokenValue: string, pin: string): Promise<void>
}
```

`TokenCreatePayload`: `{ label: string; minBucketSortOrder: number; allowsBoardPosting: boolean; expiresAt?: string }`

---

## Frontend: System Page — Tokens Tab

A third tab is added to `SystemPage` alongside Groups and Buckets.

**Token list:**
- Each active token row shows: label, access level badge (bucket name or "Front Only"), expiry (or "no expiry"), board posting flag if enabled, copy-URL button, revoke button
- Revoked tokens appear dimmed at the bottom with a strikethrough label and "revoked" badge
- "+ New" button in the header opens `TokenSheet`

**Copy URL behavior:**
- Writes `${window.location.origin}/share/${tokenValue}` to clipboard
- Button label changes to "Copied!" for 2 seconds then reverts

**Revoke flow:**
- Clicking "Revoke" opens a PIN confirmation `BottomSheet`
- On confirm, calls `tokensApi.revoke(tokenValue, pin)` which sends PIN in the request body
- On success, invalidates `['tokens']` query

---

## Frontend: TokenSheet Component

A `BottomSheet` containing the token creation form. Title: "New Share Link".

**Fields:**

1. **Label** (required text input) -- placeholder "e.g. Friend Link"

2. **Access Level** (selectable list, radio-style)
   - "Front Only" -- shown first; description: "Who's fronting, no member list"
   - Then all active buckets in ascending `sortOrder` order (fetched from `['buckets']` query)
   - Board posting toggle is hidden when "Front Only" is selected

3. **Expires** (preset chips + custom)
   - Chips: 7 days / 30 days / 90 days / Never (default)
   - Calendar icon chip: reveals a `<input type="date">` for custom date

4. **Allow board posting** (visible toggle, hidden for Front Only)

**Actions:** Cancel (resets form, closes sheet) / Create (disabled until label is filled)

**On success:** invalidates `['tokens']` query, closes sheet.

---

## Frontend: BucketSheet — Token Preview Section

Replaces the "Share token integration coming soon." placeholder at line 153.

**Shows:** Active tokens whose `minBucketSortOrder === bucket.sortOrder`

**Layout:**
- Section label: "Share Links"
- Each matching token: label on left, copy-URL button on right
- If no matching tokens: muted text "No links for this bucket yet."
- Footer link: "Manage in Tokens tab →" (navigates to `/system` with Tokens tab active -- can use a URL param or context)

Tokens data comes from the `['tokens']` TanStack Query cache (already fetched by the Tokens tab parent). BucketSheet receives the full token list as a prop or reads from the query cache directly.

---

## Testing

**Backend:**
- Update `TokensControllerTests.RevokeAsync_ValidPin_ReturnsOk` to send PIN in body
- Update `TokensControllerTests.RevokeAsync_InvalidPin_ReturnsForbid` likewise

**Frontend (Vitest):**
- `TokenSheet.test.tsx`: renders form, disables Create when label empty, hides board posting for Front Only, calls `tokensApi.create` on submit
- `SystemPage.test.tsx` (extend existing): Tokens tab renders token list, copy button behavior, revoke PIN sheet appears

---

## Design Constraints

- `minBucketSortOrder = -1` is the sentinel for ReadFrontOnly -- never render a bucket for this value, always render the special "Front Only" option
- Bucket list for the access level selector must exclude soft-deleted buckets (the API already filters these)
- `PUBLIC_BUCKET_ID` is not directly relevant here -- bucket selection in the token form is by `sortOrder`, not `id`
- Revoked tokens must remain visible in the list (soft-revoke, not deleted) -- `revokedAt != null` is the signal
- Ghost Mode is enforced server-side; the token UI does not need to handle it

---

## Out of Scope

- Editing an existing token (revoke + recreate is the intended flow)
- Per-token analytics / usage tracking
- Token QR codes
