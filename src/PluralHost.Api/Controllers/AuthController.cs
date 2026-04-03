using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

public record SetupRequest(string Password);
public record LoginRequest(string Password);
public record ChangePasswordRequest(string NewPassword, string GatekeeperPin);

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService auth) : ControllerBase
{
    // POST /api/auth/setup — One-time setup (open, no auth required)
    [HttpPost("setup")]
    public async Task<IActionResult> SetupAsync([FromBody] SetupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        var success = await auth.SetupPasswordAsync(request.Password);
        if (!success)
            return Conflict(new { error = "Login password is already configured." });

        return Ok(new { message = "Login password set. You can now log in." });
    }

    // POST /api/auth/login — sets httpOnly cookie, returns 200 no body
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> LoginAsync([FromBody] LoginRequest request)
    {
        var token = await auth.LoginAsync(request.Password);
        if (token == null)
            return Unauthorized(new { error = "Invalid credentials." });

        Response.Cookies.Append("token", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = DateTimeOffset.UtcNow.AddDays(30)
        });
        return Ok();
    }

    // POST /api/auth/logout — clears the httpOnly cookie
    [HttpPost("logout")]
    [AllowAnonymous]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("token", new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict
        });
        return Ok();
    }

    [Authorize]
    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        return Ok(new { isAuthenticated = true });
    }

    // POST /api/auth/change-password — Requires JWT + Gatekeeper PIN
    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePasswordAsync([FromBody] ChangePasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
            return BadRequest(new { error = "New password must be at least 8 characters." });

        var success = await auth.ChangePasswordAsync(request.NewPassword, request.GatekeeperPin);
        if (!success)
            return StatusCode(403, new { error = "Invalid Gatekeeper PIN." });

        return Ok(new { message = "Password updated." });
    }
}
