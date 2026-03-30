using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/tokens")]
public class TokensController(
    PluralHostContext context,
    IShareTokenService tokenService,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static TokenResponse ToResponse(AccessToken t) => new(
        t.TokenValue, t.Label, t.MinBucketSortOrder, t.AllowsBoardPosting,
        t.ExpiresAt, t.RevokedAt, t.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        // AccessToken has no HasQueryFilter — all tokens returned (active, expired, revoked)
        var tokens = await context.AccessTokens
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
        return Ok(tokens.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] TokenCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        var token = await tokenService.CreateTokenAsync(
            body.Label, body.MinBucketSortOrder, body.AllowsBoardPosting, body.ExpiresAt);
        return Ok(ToResponse(token));
    }

    [HttpPost("{tokenValue}/revoke")]
    public async Task<IActionResult> RevokeAsync(string tokenValue, [FromBody][Required] PinRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Pin))
            return BadRequest(new { error = "PIN is required" });

        if (!await gatekeeper.ValidatePinAsync(body.Pin))
            return Forbid();

        var revoked = await tokenService.RevokeTokenAsync(tokenValue);
        return revoked ? Ok() : NotFound();
    }

    [HttpPost("{tokenValue}/delete")]
    public async Task<IActionResult> DeleteAsync(string tokenValue, [FromBody][Required] PinRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Pin))
            return BadRequest(new { error = "PIN is required" });

        if (!await gatekeeper.ValidatePinAsync(body.Pin))
            return Forbid();

        var token = await context.AccessTokens
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue && t.RevokedAt != null);
        if (token == null) return NotFound();

        context.AccessTokens.Remove(token);
        await context.SaveChangesAsync();
        return NoContent();
    }
}
