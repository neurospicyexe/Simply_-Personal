# Security Audit — PluralHost

**Reviewed:** 2026-03-23
**Reviewer:** OWASP Top 10:2025 + ASVS 5.0 scan
**Status:** Pending repair (scheduled after remaining feature work)

**Summary:** 0 Critical | 0 High | 4 Medium | 3 Low | 2 Info

---

## Repaired (reference only)

### ~~HIGH — Gatekeeper PIN in Query String~~
**Fixed in Plan 9 (2026-03-23).** `DELETE /api/tokens/{tokenValue}` now uses `[FromBody] PinRequest` instead of `[FromQuery] string pin`.

---

## Open Issues

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

### MEDIUM — No Rate Limiting on Login or Freeze
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

## Info (no direct risk)

### INFO — JWT Has No Server-Side Revocation
**Location:** `src/PluralHost.Api/Services/AuthService.cs`, `Program.cs`
**Risk:** 30-day tokens with no blacklist. Logout clears the cookie client-side only — a captured token remains usable until expiry. Acceptable for single-user self-hosted tool.
**Mitigation if needed:** Short expiry (`Jwt:ExpiryHours = 1`) + refresh token, or lightweight in-memory revocation set.

---

### INFO — CORS Hardcoded to `localhost:5173`
**Location:** `src/PluralHost.Api/Program.cs`
**Risk:** Not a vulnerability (overly restrictive is safe), but a deployment footgun — production deployments with a different frontend origin will fail silently.
**Mitigation:** `p.WithOrigins(builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:5173")`

---

## Confirmed Clean

- SQL injection — EF Core LINQ throughout, no raw queries
- Path traversal — null-byte + `StartsWith` check in MediaController
- PIN storage — BCrypt wf=12
- Cookie flags — httpOnly + Secure + SameSite=Strict
- Ghost Mode order — checked before token lookup in ShareController
- Board post content — length limits enforced (100/1000 chars)
- File upload — magic byte validation + UUID filenames + extension allowlist
