using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

public record FreezeRequest(int? DurationHours);
public record PinRequest(string Pin);

[ApiController]
[Route("api/secure")]
[Authorize]
public class SecureActionController(
    IGhostModeService ghostMode,
    IGatekeeperService gatekeeper,
    ILogger<SecureActionController> logger) : ControllerBase
{
    // POST /api/secure/freeze — Anyone can freeze (crisis safety — zero friction)
    // Rate-limited to 5/min per IP to prevent DoS via repeated freeze calls
    [EnableRateLimiting("freeze")]
    [AllowAnonymous]
    [HttpPost("freeze")]
    public async Task<IActionResult> FreezeAsync([FromBody] FreezeRequest request)
    {
        if (request.DurationHours.HasValue && (request.DurationHours.Value < 1 || request.DurationHours.Value > 8760))
            return BadRequest(new { error = "DurationHours must be between 1 and 8760." });

        var duration = request.DurationHours.HasValue
            ? TimeSpan.FromHours(request.DurationHours.Value)
            : (TimeSpan?)null;
        await ghostMode.FreezeAsync(duration);
        logger.LogWarning("System frozen by {IP} (duration: {Duration})",
            HttpContext.Connection.RemoteIpAddress,
            duration.HasValue ? $"{duration.Value.TotalHours}h" : "indefinite");
        return Ok();
    }

    // POST /api/secure/unfreeze — Requires Gatekeeper PIN
    [HttpPost("unfreeze")]
    public async Task<IActionResult> UnfreezeAsync([FromBody] PinRequest request)
    {
        var ip = HttpContext.Connection.RemoteIpAddress;
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
        {
            logger.LogWarning("Invalid PIN on unfreeze attempt from {IP}", ip);
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });
        }

        await ghostMode.UnfreezeAsync();
        logger.LogInformation("System unfrozen from {IP}", ip);
        return Ok();
    }

    // POST /api/secure/request-deletion — Requires PIN, starts 72h cooldown
    [HttpPost("request-deletion")]
    public async Task<IActionResult> RequestDeletionAsync(
        [FromBody] PinRequest request,
        [FromServices] PluralHostContext? context = null)
    {
        var ip = HttpContext.Connection.RemoteIpAddress;
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
        {
            logger.LogWarning("Invalid PIN on deletion request from {IP}", ip);
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });
        }

        if (context == null)
            return BadRequest(new { error = "Context not available." });

        var settings = await context.SystemSettings.FirstAsync();
        var cooldownEnd = DateTime.UtcNow.AddHours(72);
        settings.DeletionCooldownEnd = cooldownEnd;
        await context.SaveChangesAsync();

        return Ok(new
        {
            message = "Deletion cooldown started. Account will be permanently deleted after:",
            finalizeAt = cooldownEnd
        });
    }

    // DELETE /api/secure/cancel-deletion — Requires PIN, cancels pending deletion
    [HttpDelete("cancel-deletion")]
    public async Task<IActionResult> CancelDeletionAsync(
        [FromBody] PinRequest request,
        [FromServices] PluralHostContext? context = null)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

        if (context == null)
            return BadRequest(new { error = "Context not available." });

        var settings = await context.SystemSettings.FirstAsync();
        settings.DeletionCooldownEnd = null;
        await context.SaveChangesAsync();

        return Ok(new { message = "Deletion cancelled. Your data is safe." });
    }

    // GET /api/secure/status
    [HttpGet("status")]
    public async Task<IActionResult> GetStatusAsync(
        [FromServices] PluralHostContext? context = null)
    {
        if (context == null)
            return BadRequest(new { error = "Context unavailable." });

        var pinIsSet = await gatekeeper.IsPinSetAsync();
        var settings = await context.SystemSettings.FirstAsync();
        DateTime? cooldownEnd = null;
        if (settings.DeletionCooldownEnd.HasValue
            && settings.DeletionCooldownEnd.Value > DateTime.UtcNow)
            cooldownEnd = settings.DeletionCooldownEnd;

        return Ok(new SecureStatusResponse(pinIsSet, cooldownEnd));
    }

    // PUT /api/secure/pin
    [HttpPut("pin")]
    public async Task<IActionResult> SetPinAsync([FromBody] SetPinRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewPin)
            || request.NewPin.Length < 8 || request.NewPin.Length > 64)
            return BadRequest(new { error = "PIN must be between 8 and 64 characters." });

        var pinIsSet = await gatekeeper.IsPinSetAsync();
        if (pinIsSet)
        {
            if (string.IsNullOrEmpty(request.CurrentPin))
                return BadRequest(new { error = "Current PIN is required to change the PIN." });
            if (!await gatekeeper.ValidatePinAsync(request.CurrentPin))
                return StatusCode(403, new { error = "Invalid current Gatekeeper PIN." });
        }

        await gatekeeper.SetPinAsync(request.NewPin);
        return NoContent();
    }
}
