using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("share")]
[AllowAnonymous]
public class ShareController(
    IShareTokenService tokenService,
    IGhostModeService ghostMode,
    PluralHostContext context) : ControllerBase
{
    // GET /share/{token} — Public read-only view (respects Ghost Mode + privacy flags)
    [HttpGet("{token}")]
    public async Task<IActionResult> GetSharedViewAsync(string token)
    {
        var accessToken = await tokenService.ResolveTokenAsync(token);
        if (accessToken == null)
            return Unauthorized(new { error = "Invalid or expired share token." });

        // Ghost Mode: even valid tokens return empty during a freeze
        if (await ghostMode.IsFrozenAsync())
            return Ok(new { members = Array.Empty<object>(), currentFront = Array.Empty<object>() });

        // ReadFrontOnly: only return current fronters (no member details)
        if (accessToken.Permission == TokenPermission.ReadFrontOnly)
        {
            var front = await context.FrontHistory
                .Include(f => f.Member)
                .Where(f => f.FrontEnd == null && f.Member != null && f.Member.PrivacyTier != MemberPrivacy.Private)
                .Select(f => new { f.Member!.Name, f.Member.DisplayName, f.Member.Color })
                .ToListAsync();
            return Ok(new { currentFront = front });
        }

        // ReadOnly: return public members + current front
        var members = await context.Members
            .Where(m => m.PrivacyTier != MemberPrivacy.Private)
            .Select(m => new { m.Name, m.DisplayName, m.Pronouns, m.Color, m.Status })
            .ToListAsync();

        var currentFront = await context.FrontHistory
            .Include(f => f.Member)
            .Where(f => f.FrontEnd == null && f.Member != null && f.Member.PrivacyTier != MemberPrivacy.Private)
            .Select(f => new { f.Member!.Name, f.Member.DisplayName })
            .ToListAsync();

        return Ok(new { members, currentFront });
    }
}
