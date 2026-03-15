// src/PluralHost.Api/Controllers/BoardController.cs
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
[Route("api/members/{memberId:guid}/board")]
public class BoardController(
    PluralHostContext context,
    IGatekeeperService gatekeeper,
    IGhostModeService ghostMode) : ControllerBase
{
    private static BoardMessageResponse ToResponse(BoardMessage m) =>
        new(m.Id, m.MemberId, m.AuthorName, m.Content, m.TokenId, m.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync(Guid memberId)
    {
        var messages = await context.BoardMessages
            .Where(m => m.MemberId == memberId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
        return Ok(messages.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> PostAsync(Guid memberId,
        [FromBody] BoardMessageCreateRequest body)
    {
        if (await ghostMode.IsFrozenAsync()) return Ok();

        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Content is required" });
        if (string.IsNullOrWhiteSpace(body.AuthorName))
            return BadRequest(new { error = "AuthorName is required" });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var msg = new BoardMessage
        {
            MemberId = memberId,
            AuthorName = body.AuthorName.Trim(),
            Content = body.Content.Trim(),
            TokenId = null   // owner post
        };
        context.BoardMessages.Add(msg);
        await context.SaveChangesAsync();
        return Ok(ToResponse(msg));
    }

    [HttpDelete("{msgId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid msgId,
        [FromQuery] string pin)
    {
        if (!await gatekeeper.ValidatePinAsync(pin))
            return Forbid();

        var msg = await context.BoardMessages
            .FirstOrDefaultAsync(m => m.Id == msgId && m.MemberId == memberId);
        if (msg is null) return NotFound();

        msg.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
