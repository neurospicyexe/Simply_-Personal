# Security Audit — PluralHost

**Reviewed:** 2026-04-04 (updated; original 2026-03-23)
**Reviewer:** OWASP Top 10:2025 + ASVS 5.0 scan + vibesec deep scan + OWASP pass
**Status:** Pending repair (scheduled after remaining feature work)

**Summary:** 0 Critical | 0 High | 0 Medium | 0 Low | 6 Info

---

## Repaired (reference only)

### ~~HIGH — Gatekeeper PIN in Query String~~
**Fixed in Plan 9 (2026-03-23).** `DELETE /api/tokens/{tokenValue}` now uses `[FromBody] PinRequest` instead of `[FromQuery] string pin`.

### ~~MEDIUM — SSRF via DNS Rebinding in AvatarDownloadService~~
**Fixed 2026-03-29.** Hostname now resolved via `Dns.GetHostAddressesAsync` before IP check. `AllowAutoRedirect = false` set on HttpClient handler.

### ~~MEDIUM — No Rate Limiting on Freeze Endpoint~~
**Fixed 2026-03-29.** Fixed-window rate limiter: 5 requests/min per IP on `POST /api/secure/freeze`. Returns 429 when exceeded.

---

## Open Issues

### ~~MEDIUM — No Brute-Force Protection on Login~~
**Fixed (prior work).** `[EnableRateLimiting("login")]` on `LoginAsync` -- 10 requests/min per IP fixed window.

---

### ~~MEDIUM — No HTTPS Enforcement~~
**Fixed (prior work).** `app.UseHttpsRedirection()` present in `Program.cs` middleware pipeline.

---

### ~~MEDIUM — No Security Response Headers~~
**Fixed (prior work).** Security headers middleware in `Program.cs`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`.

---

### ~~MEDIUM — No Rate Limiting on Login or Freeze~~
**Location:** `src/PluralHost.Api/Controllers/AuthController.cs:LoginAsync`, `SecureActionController.cs:FreezeAsync`
**Risk:** Login has no rate limit — BCrypt wf=12 gives ~250ms/check, still ~240 attempts/min sustained. Freeze is `[AllowAnonymous]` with no rate limit — any IP can call it in a loop to keep the system permanently frozen (DoS against owner).
**Fix:**
```csharp
builder.Services.AddRateLimiter(o => {
    o.AddFixedWindowLimiter("login", opt => {
        opt.PermitLimit = 10; opt.Window = TimeSpan.FromMinutes(1);
    });
    o.AddFixedWindowLimiter("freeze", opt => {
        opt.PermitLimit = 5; opt.Window = TimeSpan.FromMinutes(1);
    });
});
// app.UseRateLimiter();
// [EnableRateLimiting("login")] on LoginAsync
// [EnableRateLimiting("freeze")] on FreezeAsync
```
**Reference:** OWASP A06

---

### ~~LOW — `IsFrozenAsync()` Ignores `FreezeEndDate`~~
**Fixed 2026-04-04.** `GhostModeService.IsFrozenAsync()` now checks `FreezeEndDate > DateTime.UtcNow` -- timed freeze lifts immediately when expired, not after the next AutoUnfreeze poll.

---

### ~~LOW — Integer Overflow on Extreme `DurationHours`~~
**Fixed (prior work).** Validation guard added: `DurationHours` must be 1–8760 or request returns 400.

---


### ~~LOW — `PhysicalFile` Serves Without `Content-Disposition: attachment`~~
**Already fixed.** `MediaController.cs:52` uses the three-arg `PhysicalFile(path, contentType, fileDownloadName)` overload which sets `Content-Disposition: attachment` automatically.

---

### ~~MEDIUM — No Global Exception Handler (Stack Trace Exposure Risk)~~
**Fixed 2026-04-04.** `UseExceptionHandler` middleware added to `Program.cs` before security headers. Returns `{ error: "Internal server error" }` on 500, no stack traces.

---

### ~~MEDIUM — No Security Event Logging~~
**Fixed 2026-04-04.** `ILogger` injected into `AuthController`, `SecureActionController`, `AvatarDownloadService`. Logs: failed/successful login (with IP), PIN failures on unfreeze/deletion/pin-change, freeze/unfreeze state changes with IP + duration. Bare catch blocks in `AvatarDownloadService` now log exceptions before returning null.

---


### ~~LOW — Frontend API Client Reflects Raw Server Error Text~~
**Fixed 2026-04-04.** `apiFetch` now parses JSON and uses `body?.error` field; falls back to `"Request failed (${status})"` -- no raw server text reaches error state.

---

### ~~LOW — Bare Catch Blocks Swallow Exceptions Silently~~
**Fixed 2026-04-04.** Both catch blocks in `AvatarDownloadService` now log via `ILogger<AvatarDownloadService>` before returning.

---

### ~~LOW — Gatekeeper PIN Minimum is 4 Characters~~
**Fixed 2026-04-04.** Minimum raised to 8 characters in `SecureActionController.SetPinAsync`. Test fixtures updated to use 8+ char PINs.

---

## Info (no direct risk)

### INFO — JWT Has No Server-Side Revocation
**Location:** `src/PluralHost.Api/Services/AuthService.cs`, `Program.cs`
**Risk:** 30-day tokens with no blacklist. Logout clears the cookie client-side only — a captured token remains usable until expiry. Acceptable for single-user self-hosted tool.
**Mitigation if needed:** Short expiry (`Jwt:ExpiryHours = 1`) + refresh token, or lightweight in-memory revocation set.

---

### INFO — JWT Signing Key Length Validated in Chars Not Bytes
**Location:** `src/PluralHost.Api/Program.cs` key length guard
**Risk:** Non-ASCII characters are multi-byte in UTF-8 -- a 32-character key with non-ASCII chars has fewer than 256 bits of entropy. Negligible in practice (keys are typically ASCII), but not formally correct.
**Fix:** `Encoding.UTF8.GetBytes(jwtKey).Length >= 32`

---

### INFO — JWT Jti Uses `Guid.NewGuid()` (Not CSPRNG)
**Location:** `src/PluralHost.Api/Services/AuthService.cs` Jti generation
**Risk:** `Guid.NewGuid()` is not cryptographically random (uses sequential algorithm). Jti is a token identifier -- JWT security comes from the signing key, not the Jti, so this is not exploitable in isolation. Only matters if a token blacklist is added later (predictable Jti could allow pre-registration of future tokens).
**Fix:** `Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))` for Jti generation.

---

### INFO — SQLite Database Unencrypted at Rest
**Location:** `pluralhost.db` (connection string in `appsettings.json`)
**Risk:** Database file stores password hashes, PIN hashes, member data, board messages in plaintext. If the host is compromised or backups exfiltrated, all data is readable. Acceptable for single-user self-hosted threat model with OS-level access controls.
**Mitigation if needed:** sqlcipher-backed SQLite, encrypted volume, or document the single-user-only constraint explicitly.

---

### INFO — CORS Hardcoded to `localhost:5173`
**Location:** `src/PluralHost.Api/Program.cs`
**Risk:** Not a vulnerability (overly restrictive is safe), but a deployment footgun — production deployments with a different frontend origin will fail silently.
**Mitigation:** `p.WithOrigins(builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:5173")`

---

### INFO — NuGet Packages Not Pinned to Exact Versions
**Location:** `src/PluralHost.Api/PluralHost.Api.csproj`
**Risk:** Packages use wildcard minor versions (e.g. `8.*`). Minor/patch updates are automatic, which is good for security patches but could introduce regressions. No `packages.lock.json` committed.
**Mitigation:** Run `dotnet list package --vulnerable` periodically. Optionally add `RestorePackagesWithLockFile=true` to csproj for reproducible builds.

---

## Confirmed Clean (vibesec deep scan 2026-03-23 + OWASP pass 2026-04-04)

- SQL injection — EF Core LINQ throughout, no raw queries
- Path traversal — null-byte + `StartsWith` check in MediaController
- PIN storage — BCrypt wf=12
- Cookie flags — httpOnly + Secure + SameSite=Strict
- Ghost Mode order — checked before token lookup in ShareController
- Board post content — length limits enforced (100/1000 chars)
- File upload — magic byte validation + UUID filenames + extension allowlist
- XSS via markdown — react-markdown renders as React components, not raw HTML; no unsafe innerHTML usage
- XSS via board/member content — all rendered through JSX interpolation which auto-escapes HTML
- Mass assignment — all endpoints use explicit DTO records; no over-posting surface
- JWT algorithm confusion — SymmetricSecurityKey locks to HS256; alg-none rejected by Microsoft.IdentityModel.Tokens by default
- CSRF — SameSite=Strict cookies + explicit CORS allowlist; sufficient for single-user self-hosted threat model
