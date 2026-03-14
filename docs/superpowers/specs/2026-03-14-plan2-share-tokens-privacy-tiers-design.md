# Design Spec: Named Share Tokens, Privacy Tiers, and Board Posting

**Date:** 2026-03-14
**Plan sequence:** Plan 2 of 5
**Status:** Reviewed and approved — ready for implementation planning

---

## Context

Plan 1 introduced `BoardMessage`, `MemberNote`, `FrontStatus`, and member enrichment fields. Plan 2 upgrades the access-control and sharing model:

1. Replace the `IsPrivate` boolean on `Member` with a four-tier privacy system (`Public / Friend / Trusted / Private`), each tier set independently per alter.
2. Extend `AccessToken` to support the same four-tier permission ladder plus an optional board-posting flag.
3. Add a token management API so the system owner can create labeled, optionally-expiring share tokens and revoke them.
4. Allow token holders at Friend/Trusted level to post to a member's board, gated by both a per-token and a per-member flag.
5. Introduce `ITokenVisibilityService` to encapsulate all visibility and posting-permission logic.

Privacy tiers and token board posting were deferred from Plan 1. `TokenId` on `BoardMessage` was also deferred from Plan 1 and is included here.

Reference: `docs/reference/simply-plural-ui.md`

---

## Scope

### 1. Schema changes

#### Member

| Change | Detail |
|---|---|
| Remove `IsPrivate` (bool) | Replaced by `PrivacyTier` |
| Add `PrivacyTier` (enum, default `Public`) | See enum below |
| Add `AllowsBoardPosting` (bool, default `true`) | Per-member opt-out for token-holder board posts |

```
MemberPrivacy enum:
  Public  = 0   (visible to all token levels)
  Friend  = 1   (visible to Friend and Trusted tokens)
  Trusted = 2   (visible to Trusted tokens only)
  Private = 3   (never visible to any token)
```

**Migration:** `IsPrivate = true` → `PrivacyTier = Private (3)`. `IsPrivate = false` → `PrivacyTier = Public (0)`. Drop `IsPrivate` column after migration. All existing rows get valid values.

**SP DTO read mapping:** `SpMemberContent.Private` maps from `member.PrivacyTier == MemberPrivacy.Private`. No behavior change from SP's perspective.

**SP DTO write mapping:** `SpMembersController` currently sets `member.IsPrivate = body.Private`. After migration:
- `body.Private = true` → `member.PrivacyTier = MemberPrivacy.Private` (always coerce to Private)
- `body.Private = false` AND `member.PrivacyTier == MemberPrivacy.Private` → `member.PrivacyTier = MemberPrivacy.Public` (un-privatise only when currently Private)
- `body.Private = false` AND `member.PrivacyTier` is `Public`/`Friend`/`Trusted` → leave tier unchanged (SP has no concept of intermediate tiers; don't silently downgrade)

Both the POST (creation) and PATCH SP endpoints must be updated. On POST (new member), default to `Public` when `body.Private` is absent or false.

#### AccessToken

| Change | Detail |
|---|---|
| Rename `ReadOnly` → `Public`, reassign integer values — **data migration required** | See note below |
| Add `Friend = 2`, `Trusted = 3` to `TokenPermission` | New permission levels |
| Add `AllowsBoardPosting` (bool, default `false`) | Per-token board posting flag |

```
Current enum (implicit integers):
  ReadOnly      = 0
  ReadFrontOnly = 1

New enum (explicit integers):
  ReadFrontOnly = 0   (current fronters only, no member list)
  Public        = 1   (renamed from ReadOnly)
  Friend        = 2
  Trusted       = 3
```

**Data migration required:** Integer values are swapped. The migration must UPDATE rows before the rename takes effect:
```sql
UPDATE AccessTokens SET Permission = CASE
  WHEN Permission = 0 THEN 1   -- ReadOnly(0) → Public(1)
  WHEN Permission = 1 THEN 0   -- ReadFrontOnly(1) → ReadFrontOnly(0)
  ELSE Permission
END;
```

`Label` and `ExpiresAt` already exist on `AccessToken`. `ExpiresAt = null` means indefinite. No other column changes.

#### BoardMessage

| Change | Detail |
|---|---|
| Add `TokenId` (string?, nullable FK → `AccessToken.TokenValue`) | Set when posted via share token; null for owner-posted messages |

No cascade delete — preserve board messages if token is later revoked. FK is optional (nullable).

---

### 2. ITokenVisibilityService

```csharp
public interface ITokenVisibilityService
{
    /// Filters members to those visible at the given permission level.
    /// ReadFrontOnly returns an empty queryable (front endpoint bypasses this).
    IQueryable<Member> FilterByPermission(IQueryable<Member> members, TokenPermission permission);

    /// Returns true only when all posting conditions are met.
    bool CanPostToBoard(AccessToken token, Member member);
}
```

**`FilterByPermission` logic:** For `Public`, `Friend`, `Trusted` — returns members where `(int)member.PrivacyTier < (int)permission` (strict less-than). The two enums are offset by 1 (`TokenPermission.Public=1` maps to `MemberPrivacy.Public=0`), so strict `<` produces the correct result:

| Token permission (int) | Sees member tiers | Why |
|---|---|---|
| Public (1) | PrivacyTier < 1 → only Public (0) | ✓ |
| Friend (2) | PrivacyTier < 2 → Public (0), Friend (1) | ✓ |
| Trusted (3) | PrivacyTier < 3 → Public (0), Friend (1), Trusted (2) | ✓ |

`Private` members (tier=3) are never returned because `3 < 3` is false. For `ReadFrontOnly` — throw `InvalidOperationException("ReadFrontOnly tokens must not call FilterByPermission")`. The front endpoint bypasses this method entirely; if this overload is called with `ReadFrontOnly`, it is a programming error and should surface loudly rather than silently returning empty results.

**Important:** `FilterByPermission` must NOT call `.IgnoreQueryFilters()`. The EF Core combined query filter (soft-delete + Ghost Mode) must remain active. Bypassing it would expose deleted members or members during a freeze.

**`CanPostToBoard` logic:** Returns `true` only when ALL conditions hold:
- `token.Permission` is `Friend` or `Trusted`
- `token.AllowsBoardPosting = true`
- `member.AllowsBoardPosting = true`

Token validity (not expired, not revoked) is validated upstream before calling this method.

---

### 2a. IShareTokenService changes

The existing interface must be updated:

```csharp
// CreateTokenAsync gains allowsBoardPosting parameter
Task<AccessToken> CreateTokenAsync(
    string? label,
    TokenPermission permission,
    bool allowsBoardPosting,
    DateTime? expiresAt);

// ResolveTokenAsync returns a discriminated result instead of AccessToken?
// so callers can distinguish expired vs. revoked/not-found
Task<TokenResolveResult> ResolveTokenAsync(string tokenValue);

public record TokenResolveResult(AccessToken? Token, TokenResolveStatus Status);
public enum TokenResolveStatus { Valid, NotFound, Revoked, Expired }
```

`ShareController` and the new board post endpoint use `TokenResolveStatus` to return the correct error message (401 "Token has expired" vs. 401 "Token is invalid").

`NotFound` and `Revoked` both map to the same 401 response body ("Token is invalid") — don't leak whether a token ever existed. The `Revoked` status is available for internal logging/audit purposes only.

`RevokeTokenAsync` must be updated to return `bool` (true = revoked, false = token not found) instead of throwing `KeyNotFoundException`. The `DELETE /api/tokens/{tokenValue}` endpoint returns 404 if `RevokeTokenAsync` returns false.

---

### 3. Token management API (owner-side, `[Authorize]`)

```
GET    /api/tokens                → list all tokens (active, expired, revoked)
POST   /api/tokens                → create a new token
DELETE /api/tokens/{tokenValue}   → revoke token (Gatekeeper PIN required)
```

**`POST /api/tokens` request:**
```json
{
  "label": "Blue",
  "permission": "Friend",
  "allowsBoardPosting": true,
  "expiresAt": "2026-06-01T00:00:00Z"
}
```
`label` required. `permission` required. `allowsBoardPosting` defaults to `false` if omitted. `expiresAt` optional — omit or null for indefinite.

Token value is generated by the existing `IShareTokenService` (`RandomNumberGenerator.GetBytes(32)`, URL-safe Base64).

**`GET /api/tokens` response:** Each token includes label, permission, allowsBoardPosting, expiresAt, createdAt, revokedAt, and the token value string so the owner can copy it to share. Ordered by `CreatedAt DESC`. Returning token values to an authenticated owner session is intentional — single-user self-hosted app, the owner needs values to distribute links.

**No `PATCH`** — to change token settings, revoke and create a new one. Simple and auditable.

**`DELETE` revokes** via existing `RevokedAt` field on `AccessToken`. PIN required — existing `IGatekeeperService` pattern.

---

### 4. Share API (token-holder side)

```
GET  /share/{token}                       → existing, now filters by PrivacyTier
POST /share/{token}/board/{memberId}      → new, token holder posts to member's board
```

**`GET /share/{token}`** — Ghost Mode check FIRST (returns `[]` if frozen, before touching the token). Token validation second using `ResolveTokenAsync` (returns 401 on expired/revoked/not-found). Then `FilterByPermission` replaces the old `IsPrivate` check. `ReadFrontOnly` tokens hit the existing fronters-only path unchanged.

**Note:** The current `ShareController` implementation has Ghost Mode check AFTER token resolution — this is a bug that must be corrected in this plan. Ghost Mode must short-circuit before any token DB lookup.

**Owner-side board POST (`POST /api/members/{memberId}/board`) and Ghost Mode:** Owner-side board writes ARE blocked during a freeze. The `BoardMessage` entity already has a combined `HasQueryFilter` (soft-delete + Ghost Mode) on reads. Writes should be consistent: add a Ghost Mode guard to `BoardController.PostAsync` that returns 200 OK silently if `IsFrozen = true` (same silent pattern as other write endpoints during freeze). This is an amendment to Plan 1's `BoardController` scope.

**`POST /share/{token}/board/{memberId}`** request body:
```json
{
  "authorName": "Blue",
  "content": "hey just checking in"
}
```

Validation order:
1. Ghost Mode → 204 No Content (silent, short-circuits — no further processing; 204 chosen over 200 `{}` to avoid ambiguous empty-object response shape)
2. Input validation: `AuthorName` non-empty and ≤ 100 chars, `Content` non-empty and ≤ 1000 chars → 400 if not (cheap, before any DB work)
3. Token valid via `ResolveTokenAsync` → 401 "Token has expired" or 401 "Token is invalid" based on `TokenResolveStatus`
4. Resolve member using `.IgnoreQueryFilters()` with a manual `DeletedAt == null` guard — this lets us distinguish "member truly does not exist" (404) from "member exists but has a PrivacyTier the token cannot see" (403 "Board posting not permitted"). Soft-deleted members return 404 (no leak that they existed). Members with PrivacyTier > token permission return 403. Note: `.IgnoreQueryFilters()` is acceptable here because we are on a public-facing endpoint where Ghost Mode is already handled in step 1; using it only to check existence, not to return data.
5. `CanPostToBoard(token, member)` — if `token.Permission < Friend` or `token.AllowsBoardPosting = false` → 403 "Board posting not permitted"; if `member.AllowsBoardPosting = false` → 403 "This member is not accepting messages"
6. Insert `BoardMessage` with `MemberId`, `AuthorName`, `Content`, `TokenId = token.TokenValue`

---

### 5. Error handling

| Scenario | Response |
|---|---|
| Token not found | 401 — "Token is invalid" (don't leak existence) |
| Token revoked | 401 — "Token is invalid" |
| Token expired | 401 — "Token has expired" |
| Member not visible at token's permission level (exists but tier too high) | 403 — "Board posting not permitted" (don't leak existence) |
| Member truly does not exist in system | 404 |
| `token.Permission < Friend` (Public/ReadFrontOnly trying to post) | 403 — "Board posting not permitted" |
| `token.AllowsBoardPosting = false` | 403 — "Board posting not permitted" |
| `member.AllowsBoardPosting = false` | 403 — "This member is not accepting messages" |
| Ghost Mode on GET /share | 200 `[]` |
| Ghost Mode on POST /share/.../board | 204 No Content (silent) |
| Revoke with invalid PIN | 403 — existing Gatekeeper pattern |
| Create token: missing label | 400 — "Label is required" |
| Create token: missing permission | 400 — "Permission is required" |
| GET /api/tokens exposes token values | Intentional — single-user self-hosted app, owner needs values to share links; authenticated endpoint only |

---

### 6. Testing

| Area | Test cases |
|---|---|
| **PrivacyTier migration** | `IsPrivate=true` rows → `PrivacyTier=Private`; `IsPrivate=false` rows → `PrivacyTier=Public`; column dropped |
| **TokenPermission rename** | Load `AccessToken` from DB after migration — assert `token.Permission == TokenPermission.Public` for a row that was originally stored as `ReadOnly (0)`; assert `token.Permission == TokenPermission.ReadFrontOnly` for a row originally stored as `ReadFrontOnly (1)` |
| **FilterByPermission** | Public token: sees Public, not Friend/Trusted/Private; Friend token: sees Public+Friend, not Trusted/Private; Trusted token: sees Public+Friend+Trusted, not Private; ReadFrontOnly: returns empty |
| **CanPostToBoard** | Friend+both flags true → true; Trusted+both flags true → true; Public token → false; ReadFrontOnly token → false; token flag false → false; member flag false → false |
| **Token management** | Create with expiry; create indefinite (null expiresAt); list shows all states (active/expired/revoked); revoke (PIN); revoke with bad PIN → 403 |
| **Token expiry** | Expired token on GET /share → 401; expired token on board POST → 401 |
| **Board posting** | Valid post creates BoardMessage with TokenId set; owner post has TokenId null; member AllowsBoardPosting=false → 403; token AllowsBoardPosting=false → 403 |
| **Ghost Mode** | GET /share returns `[]` when frozen (token validation skipped); board POST returns 204 when frozen (token validation skipped) |
| **SP DTO read** | `SpMemberContent.Private` maps from `PrivacyTier == MemberPrivacy.Private` |
| **SP DTO write** | POST `Private: true` → `PrivacyTier = Private`; PATCH `Private: false` on a `Private` member → `PrivacyTier = Public`; PATCH `Private: false` on a `Friend` member → tier unchanged (no downgrade) |
| **Native MembersController** | `MembersController.PostAsync` and `PatchAsync` updated in lockstep with `MemberCreateRequest`/`MemberUpdateRequest` DTO changes; `IsPrivate` field removed from both request and response |
| **GET /api/tokens ordering** | Response ordered `CreatedAt DESC`; `DELETE` with unknown token → 404 |
| **FilterByPermission guard** | Calling with `ReadFrontOnly` throws `InvalidOperationException` |
| **FilterByPermission + Ghost Mode** | `FilterByPermission` against a frozen context returns empty (combined query filter still active) |
| **DELETE /api/tokens already revoked** | Revoking a token that is already revoked → 404 (same as not found — `RevokeTokenAsync` returns false for both) |
| **NativeDtos** | `MemberResponse`, `MemberCreateRequest`, `MemberUpdateRequest` replace `IsPrivate` bool with `PrivacyTier MemberPrivacy`; `MemberResponse` and `MemberUpdateRequest` add `AllowsBoardPosting` bool |
| **BoardMessageResponse** | Updated to include `TokenId` (string?) so owner can trace which token posted a message |

---

### 7. Migration

One EF Core migration covering:

- `Member`: add `PrivacyTier` column (default 0 = Public); data migration `IsPrivate=true` → `PrivacyTier=3`; drop `IsPrivate`
- `Member`: add `AllowsBoardPosting` column (default `true`)
- `AccessToken`: add `AllowsBoardPosting` column (default `false`)
- `BoardMessage`: add `TokenId` column (nullable string, FK → `AccessToken.TokenValue`, no cascade delete)
- `AccessToken`: SQL `UPDATE` to swap `Permission` integer values (0↔1) before C# rename takes effect (see Section 1 — AccessToken for SQL statement)
- `TokenPermission` enum in C#: `ReadOnly` renamed to `Public`, explicit integer literals added to all values

Auto-applied on startup via `context.Database.MigrateAsync()` (existing pattern).

---

## Out of scope (deferred)

| Feature | Plan |
|---|---|
| Custom fields (programmable "Additional Info" tab) | Plan 3 |
| Global (system-level) journals | Plan 3 |
| Simply Plural / PluralKit import pipeline | Plan 4 |
| React Flow mind map, heatmaps, PWA | Plan 5 |
