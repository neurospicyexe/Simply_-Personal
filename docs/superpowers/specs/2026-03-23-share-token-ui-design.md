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
| `src/PluralHost.Web/src/types.ts` | Add `AccessToken` + `TokenCreatePayload` interfaces |
| `src/PluralHost.Web/src/components/TokenSheet.tsx` | Create token bottom sheet |
| `src/PluralHost.Web/src/components/TokenSheet.module.css` | Styles |

### Modified files

| File | Change |
|------|--------|
| `src/PluralHost.Api/Controllers/TokensController.cs` | Move PIN from `[FromQuery]` to `[FromBody]` |
| `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs` | Update revoke tests |
| `src/PluralHost.Web/src/pages/SystemPage.tsx` | Add "Tokens" tab; read `?tab=` query param |
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

`PinRequest` record already exists in `NativeDtos.cs`. The handler must validate `body` is non-null and `body.Pin` is non-empty before calling `ValidatePinAsync` -- consistent with other PIN-gated actions. If the Gatekeeper PIN has not been configured, `ValidatePinAsync` returns false and the endpoint returns 403, same as any other invalid PIN.

---

## Frontend: Types (`src/types.ts`)

```ts
export interface AccessToken {
  tokenValue: string
  label: string | null
  minBucketSortOrder: number   // -1 = ReadFrontOnly sentinel
  allowsBoardPosting: boolean
  expiresAt: string | null     // ISO 8601 UTC string or null
  revokedAt: string | null     // ISO 8601 UTC string or null
  createdAt: string            // ISO 8601 UTC string
}

export interface TokenCreatePayload {
  label: string
  minBucketSortOrder: number
  allowsBoardPosting: boolean
  expiresAt?: string           // ISO 8601 UTC string (see Expiry section)
}
```

Both types go in `src/types.ts` alongside other shared payload/response types.

---

## Frontend: API Module (`src/api/tokens.ts`)

```ts
import { apiFetch } from './client'
import type { AccessToken, TokenCreatePayload } from '../types'

export const tokensApi = {
  list: (): Promise<AccessToken[]> =>
    apiFetch<AccessToken[]>('/api/tokens'),

  create: (body: TokenCreatePayload): Promise<AccessToken> =>
    apiFetch<AccessToken>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revoke: (tokenValue: string, pin: string): Promise<void> =>
    apiFetch<void>(`/api/tokens/${tokenValue}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
```

---

## Frontend: System Page — Tokens Tab

A third tab is added to `SystemPage` alongside Groups and Buckets. `SystemPage` reads the `?tab=` URL query param via `useSearchParams` to support deep-linking from BucketSheet. If `?tab=Tokens` is present on mount, the Tokens tab is activated. If no param, default to the first tab (Groups) as before.

**Token list:**
- Loading state: skeleton or spinner
- Error state: "Failed to load tokens" with retry
- Empty state: "No share links yet." with "+ New" CTA
- Each active token row shows: label, access level badge (bucket name or "Front Only"), expiry ("no expiry" if null), board posting indicator if enabled, copy-URL button, revoke button
- Revoked tokens appear dimmed at the bottom (max 10 shown, no pagination required -- revoked tokens accumulate slowly in practice)
- "+ New" button in the header opens `TokenSheet`

**Copy URL behavior:**
- Writes `${window.location.origin}/share/${tokenValue}` to clipboard via `navigator.clipboard.writeText`
- Button label changes to "Copied!" for 2 seconds then reverts; `aria-label` also updated for screen reader feedback

**Revoke flow:**
- Clicking "Revoke" opens a PIN confirmation `BottomSheet`
- On confirm, calls `tokensApi.revoke(tokenValue, pin)` (PIN sent in request body)
- On success, invalidates `['tokens']` query

---

## Frontend: TokenSheet Component

A `BottomSheet` containing the token creation form. Title: "New Share Link".

**Fields:**

1. **Label** (required text input) -- placeholder "e.g. Friend Link"

2. **Access Level** (selectable list, radio-style)
   - "Front Only" shown first; description: "Who's fronting, no member list"
   - Then all active buckets in ascending `sortOrder` order (fetched from `['buckets']` query)
   - Board posting toggle is hidden when "Front Only" is selected

3. **Expires** (preset chips + custom date)
   - Chips: 7 days / 30 days / 90 days / Never (default selected on open)
   - Calendar chip: clicking it deselects all preset chips, reveals `<input type="date">`
   - Selecting any preset chip clears the custom date input and hides it
   - Only one expiry mode is active at a time
   - When sending to the API: preset chips compute `expiresAt` as `new Date(Date.now() + days * 86400000).toISOString()` (ISO 8601 UTC). Custom date picker value (`YYYY-MM-DD`) is converted to end-of-day UTC: `new Date(dateString + 'T23:59:59Z').toISOString()`. "Never" sends no `expiresAt` field.

4. **Allow board posting** (visible toggle, default: **off**, hidden when "Front Only" is selected)

**Actions:** Cancel (resets form, closes sheet) / Create (disabled until label is non-empty)

**On success:** invalidates `['tokens']` query, closes sheet.

---

## Frontend: BucketSheet — Token Preview Section

Replaces the "Share token integration coming soon." placeholder (line 153 of `BucketSheet.tsx`).

**Data:** BucketSheet calls `useQuery({ queryKey: ['tokens'], queryFn: tokensApi.list })` directly. TanStack Query deduplicates the request if the Tokens tab is also mounted; no prop-drilling required.

**Shows:** Active tokens (not revoked) whose `minBucketSortOrder === bucket.sortOrder`.

**Layout:**
- Section label: "Share Links"
- Each matching token: label on left, copy-URL button on right (same clipboard + "Copied!" behavior as Tokens tab)
- If no matching tokens: muted text "No links for this bucket yet."
- Footer link: "Manage in Tokens tab →" navigates to `/system?tab=Tokens` via React Router `useNavigate`

---

## Testing

**Backend:**
- Update `TokensControllerTests.RevokeAsync_ValidPin_ReturnsOk` -- send `PinRequest` in body, not query string
- Update `TokensControllerTests.RevokeAsync_InvalidPin_ReturnsForbid` likewise
- Add: `RevokeAsync_MissingBody_ReturnsBadRequest`

**Frontend (Vitest):**
- `TokenSheet.test.tsx`:
  - Renders form fields
  - Disables Create when label is empty
  - Hides board posting toggle when "Front Only" is selected
  - Selecting a preset chip after custom date clears the date input
  - Calls `tokensApi.create` with correct payload on submit
- `SystemPage.test.tsx` (extend existing):
  - Tokens tab renders token list
  - Copy button changes label to "Copied!"
  - Revoke opens PIN sheet

---

## Design Constraints

- `minBucketSortOrder = -1` is the sentinel for ReadFrontOnly -- never render a bucket for this value; always render the special "Front Only" option
- Bucket list for the access level selector must exclude soft-deleted buckets (the API already filters these)
- `PUBLIC_BUCKET_ID` is not relevant here -- bucket selection in the token form is by `sortOrder`, not `id`
- Revoked tokens remain visible in the list (soft-revoke) -- `revokedAt != null` is the signal
- Ghost Mode is enforced server-side; the token UI does not need to handle it
- `expiresAt` must always be sent as a valid ISO 8601 UTC string, never a bare `YYYY-MM-DD` date string

---

## Out of Scope

- Editing an existing token (revoke + recreate is the intended flow)
- Per-token analytics / usage tracking
- Token QR codes
- Pagination of revoked tokens (max 10 revoked shown, sufficient for expected usage)
