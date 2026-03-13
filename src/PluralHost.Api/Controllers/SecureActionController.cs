using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

public record FreezeRequest(int? DurationHours);
public record PinRequest(string Pin);

[ApiController]
[Route("api/secure")]
[Authorize]
public class SecureActionController(
    IGhostModeService ghostMode,
    IGatekeeperService gatekeeper) : ControllerBase
{
    // POST /api/secure/freeze — Anyone can freeze (crisis safety — zero friction)
    [AllowAnonymous]
    [HttpPost("freeze")]
    public async Task<IActionResult> FreezeAsync([FromBody] FreezeRequest request)
    {
        var duration = request.DurationHours.HasValue
            ? TimeSpan.FromHours(request.DurationHours.Value)
            : (TimeSpan?)null;
        await ghostMode.FreezeAsync(duration);
        return Ok();
    }

    // POST /api/secure/unfreeze — Requires Gatekeeper PIN
    [HttpPost("unfreeze")]
    public async Task<IActionResult> UnfreezeAsync([FromBody] PinRequest request)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

        await ghostMode.UnfreezeAsync();
        return Ok();
    }

    // POST /api/secure/request-deletion — Requires PIN, starts 72h cooldown
    [HttpPost("request-deletion")]
    public async Task<IActionResult> RequestDeletionAsync(
        [FromBody] PinRequest request,
        [FromServices] PluralHostContext? context = null)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

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
}
