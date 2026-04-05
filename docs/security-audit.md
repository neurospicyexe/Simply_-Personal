# Security Audit — PluralHost

**Reviewed:** 2026-04-04 (updated; original 2026-03-23)
**Reviewer:** OWASP Top 10:2025 + ASVS 5.0 scan + vibesec deep scan + OWASP pass
**Status:** Pending repair (scheduled after remaining feature work)

**Summary:** 0 Critical | 0 High | 3 Medium | 6 Low | 6 Info

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

### MEDIUM — No Brute-Force Protection on Login
**Location:** `src/PluralHost.Api/Controllers/AuthController.cs:LoginAsync`
**Risk:** `POST /api/auth/login` has no rate limiting. BCrypt wf=12 (~250ms/check) limits to ~240 attempts/min under sustained attack.
**Fix:** Apply same fixed-window rate limiter pattern as freeze endpoint (10 attempts/min per IP with back-off).
**Reference:** OWASP A06

---

### ~~MEDIUM — SSRF via DNS Rebinding in AvatarDownloadService~~
**Location:** `src/PluralHost.Api/Services/AvatarDownloadService.cs:IsPrivateAddress()`
**Risk:** The service correctly blocks raw private IPs (10.x, 172.16.x, 192.168.x, loopback) but skips validation entirely for hostnames: `"Hostname — allow (public DNS resolves it). Only raw IPs need SSRF checking."` An attacker who controls DNS for a domain can point it at `169.254.169.254` (AWS instance metadata), `10.x.x.x` (internal network), or any other private address. The IP check is only applied when the host parses as a raw IP.
**Fix:** Resolve DNS before connecting and validate the resolved IP:
```csharp
private static bool IsPrivateAddress(Uri uri)
{
    var host = uri.Host.ToLowerInvariant();
    if (host == "localhost") return true;

    // Resolve hostname to IP, then check
    IPAddress ip;
    if (!IPAddress.TryParse(host, out ip))
    {
        try
        {
            var addresses = Dns.GetHostAddresses(host);
            if (addresses.Length == 0) return true; // can't resolve = block
            ip = addresses[0];
        }
        catch { return true; } // resolution failure = block
    }

    var bytes = ip.GetAddressBytes();
    if (bytes.Length == 16) return true; // block IPv6
    return (bytes[0] == 10) ||
           (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
           (bytes[0] == 192 && bytes[1] == 168) ||
           (bytes[0] == 169 && bytes[1] == 254) || // link-local / cloud metadata
           (bytes[0] == 127);
}
```
**Reference:** OWASP A10 / CWE-918 (SSRF)

---

### MEDIUM — No HTTPS Enforcement
**Location:** `src/PluralHost.Api/Program.cs` (middleware pipeline)
**Risk:** Passwords, PINs, and JWT cookies travel in plaintext if a client connects over HTTP. `Secure: true` on the cookie provides no protection unless HTTPS is actually enforced.
**Fix:**
```csharp
app.UseCors();
app.UseHttpsRedirection();  // add here
app.UseAuthentication();
```
**Reference:** OWASP A02 / ASVS L1

---

### MEDIUM — No Security Response Headers
**Location:** `src/PluralHost.Api/Program.cs` (middleware pipeline)
**Risk:** Missing HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Every response is missing these.
**Fix:** Add before `UseAuthentication()`:
```csharp
app.Use(async (ctx, next) => {
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});
```
**Reference:** OWASP A02

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

### LOW — `IsFrozenAsync()` Ignores `FreezeEndDate`
**Location:** `src/PluralHost.Api/Services/GhostModeService.cs:IsFrozenAsync()`
**Risk:** Returns `settings.IsFrozen` without checking whether `FreezeEndDate` has already passed. Data can stay hidden up to 5 minutes after a timed freeze should have lifted (AutoUnfreezeService polls every 5 minutes).
**Fix:**
```csharp
public async Task<bool> IsFrozenAsync()
{
    var settings = await context.SystemSettings.FirstAsync();
    return settings.IsFrozen &&
        (settings.FreezeEndDate == null || settings.FreezeEndDate > DateTime.UtcNow);
}
```
**Reference:** OWASP A01

---

### LOW — Integer Overflow on Extreme `DurationHours`
**Location:** `src/PluralHost.Api/Controllers/SecureActionController.cs:FreezeAsync`
**Risk:** `TimeSpan.FromHours(int.MaxValue)` throws `OverflowException` → HTTP 500. The freeze endpoint is `[AllowAnonymous]`, so no auth needed to trigger it.
**Fix:**
```csharp
if (request.DurationHours.HasValue &&
    (request.DurationHours.Value < 1 || request.DurationHours.Value > 8760))
    return BadRequest(new { error = "DurationHours must be between 1 and 8760." });
```
**Reference:** OWASP A10 / CWE-190

---

### LOW — `PhysicalFile` Serves Without `Content-Disposition: attachment`
**Location:** `src/PluralHost.Api/Controllers/MediaController.cs:Get()`
**Risk:** Browser renders files inline. If an SVG/HTML were ever served from `secure_uploads`, it would execute in the owner's authenticated session. Upload path validates magic bytes and restricts to jpg/png/gif/webp, but defense-in-depth suggests forcing download regardless.
**Fix:**
```csharp
return PhysicalFile(resolved, contentType, Path.GetFileName(resolved));
```
**Reference:** OWASP A05 / CWE-434

---

### ~~MEDIUM — No Global Exception Handler (Stack Trace Exposure Risk)~~
**Fixed 2026-04-04.** `UseExceptionHandler` middleware added to `Program.cs` before security headers. Returns `{ error: "Internal server error" }` on 500, no stack traces.

---

### ~~MEDIUM — No Security Event Logging~~
**Fixed 2026-04-04.** `ILogger` injected into `AuthController`, `SecureActionController`, `AvatarDownloadService`. Logs: failed/successful login (with IP), PIN failures on unfreeze/deletion/pin-change, freeze/unfreeze state changes with IP + duration. Bare catch blocks in `AvatarDownloadService` now log exceptions before returning null.

---


### LOW — Frontend API Client Reflects Raw Server Error Text
**Location:** `src/PluralHost.Web/src/api/client.ts` line ~21
**Risk:** Error messages are built from raw response body text and passed into error state. React escapes JSX interpolation so no immediate XSS -- but if this value ever reaches an unsafe render path or a logging sink it becomes exploitable. Backend validation errors can contain user-supplied field names.
**Fix:** Parse JSON error response and use a sanitized message field, or hard-cap the reflected text.
**Reference:** OWASP A03

---

### LOW — Bare Catch Blocks Swallow Exceptions Silently
**Location:** `src/PluralHost.Api/Services/AvatarDownloadService.cs` lines ~81 and ~104
**Risk:** `catch { return null; }` and `catch { return true; }` suppress all exceptions without logging. Download failures and DNS resolution errors are invisible -- makes debugging and attack detection impossible.
**Fix:** Add `_logger.LogError(ex, "...")` before returning in each catch block. Fail-closed behavior (return null/true) is correct; silent failure is not.
**Reference:** OWASP A09

---

### LOW — Gatekeeper PIN Minimum is 4 Characters
**Location:** `src/PluralHost.Api/Controllers/SecureActionController.cs` PIN validation
**Risk:** 4-char numeric PIN = 10,000 combinations. With rate limiting at 5/min, brute force completes in ~33 hours. Acceptable for current threat model but weak for a "Gatekeeper" protecting deletions.
**Fix:** Enforce 8-char minimum, or add per-IP lockout after 10 failed attempts.
**Reference:** OWASP A07 / ASVS L1

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
