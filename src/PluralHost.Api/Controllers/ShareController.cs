using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("share")]
[AllowAnonymous]
public class ShareController(
    IShareTokenService tokenService,
    IGhostModeService ghostMode,
    PluralHostContext context,
    ITokenVisibilityService visibility) : ControllerBase
{
    // GET /share/{token}
    [HttpGet("{token}")]
    public async Task<IActionResult> GetSharedViewAsync(string token)
    {
        // Ghost Mode FIRST — before any token DB lookup
        if (await ghostMode.IsFrozenAsync())
            return Ok(new { members = Array.Empty<object>(), currentFront = Array.Empty<object>() });

        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;

        if (accessToken.Permission == TokenPermission.ReadFrontOnly)
        {
            var front = await context.FrontHistory
                .Include(f => f.Member)
                .Where(f => f.FrontEnd == null &&
                            f.Member != null &&
                            f.Member.PrivacyTier == MemberPrivacy.Public)
                .Select(f => new { f.Member!.Name, f.Member.DisplayName, f.Member.Color })
                .ToListAsync();
            return Ok(new { currentFront = front });
        }

        var members = await visibility
            .FilterByPermission(context.Members, accessToken.Permission)
            .Select(m => new { m.Name, m.DisplayName, m.Pronouns, m.Color, m.Status })
            .ToListAsync();

        var currentFront = await context.FrontHistory
            .Include(f => f.Member)
            .Where(f => f.FrontEnd == null &&
                        f.Member != null &&
                        f.Member.DeletedAt == null &&
                        (int)f.Member.PrivacyTier < (int)accessToken.Permission)
            .ToListAsync();

        var visibleFront = currentFront
            .Select(f => new { f.Member!.Name, f.Member.DisplayName })
            .ToList();

        return Ok(new { members, currentFront = visibleFront });
    }

    // POST /share/{token}/board/{memberId}
    [HttpPost("{token}/board/{memberId:guid}")]
    public async Task<IActionResult> PostToBoardAsync(
        string token, Guid memberId,
        [FromBody] ShareBoardPostRequest body)
    {
        // 1. Ghost Mode — silent, no state revealed
        if (await ghostMode.IsFrozenAsync()) return NoContent();

        // 2. Input validation — cheap, before DB work
        if (string.IsNullOrWhiteSpace(body.AuthorName) || body.AuthorName.Length > 100)
            return BadRequest(new { error = "AuthorName is required and must be 100 characters or fewer." });
        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 1000)
            return BadRequest(new { error = "Content is required and must be 1000 characters or fewer." });

        // 3. Token validation
        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;

        // 4. Member lookup — IgnoreQueryFilters to distinguish 404 (gone) vs 403 (private tier)
        var member = await context.Members
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == memberId);

        if (member is null || member.DeletedAt is not null) return NotFound();

        // Invisible to this token (tier too high) → 403, don't leak existence
        if ((int)member.PrivacyTier >= (int)accessToken.Permission)
            return StatusCode(403, new { error = "Board posting not permitted." });

        // 5. Posting permission check
        if (!visibility.CanPostToBoard(accessToken, member))
        {
            var msg = !member.AllowsBoardPosting
                ? "This member is not accepting messages."
                : "Board posting not permitted.";
            return StatusCode(403, new { error = msg });
        }

        // 6. Insert
        var message = new BoardMessage
        {
            MemberId = memberId,
            AuthorName = body.AuthorName.Trim(),
            Content = body.Content.Trim(),
            TokenId = accessToken.TokenValue
        };
        context.BoardMessages.Add(message);
        await context.SaveChangesAsync();
        return Ok(new { id = message.Id });
    }
}
