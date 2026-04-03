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

        if (accessToken.MinBucketSortOrder == -1)
        {
            var front = await context.FrontHistory
                .Include(f => f.Member)
                    .ThenInclude(m => m!.Bucket)
                .Include(f => f.CustomStatus)
                .Where(f => f.FrontEnd == null &&
                            f.Member != null &&
                            f.Member.BucketId == PrivacyBucket.PublicId)
                .ToListAsync();
            var frontDtos = front.Select(f => new SharedFrontEntryDto(
                f.Member!.Id,
                f.Member.Name,
                f.Member.DisplayName,
                f.Member.Color,
                f.Member.AvatarPath,
                f.CustomStatus?.Label,
                f.CustomStatus?.Color))
                .ToList();
            return Ok(new { currentFront = frontDtos });
        }

        var rawMembers = await visibility
            .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
            .Include(m => m.CustomFieldValues)
                .ThenInclude(cfv => cfv.Field)
            .Include(m => m.CustomFieldValues)
                .ThenInclude(cfv => cfv.Bucket)
            .Include(m => m.Bucket!)
                .ThenInclude(b => b.ExcludedFields)
            .ToListAsync();

        var members = rawMembers.Select(m =>
        {
            var excludedFieldIds = m.Bucket?.ExcludedFields
                .Select(e => e.FieldId).ToHashSet() ?? new HashSet<Guid>();

            return new
            {
                id = m.Id,
                m.Name,
                m.DisplayName,
                m.Pronouns,
                m.Color,
                m.AvatarPath,
                m.Description,
                m.Status,
                customFields = m.CustomFieldValues
                    .Where(cfv => cfv.Field != null &&
                                  cfv.Field.DeletedAt == null &&
                                  cfv.Bucket != null &&
                                  cfv.Bucket.SortOrder <= accessToken.MinBucketSortOrder &&
                                  !excludedFieldIds.Contains(cfv.FieldId))
                    .Select(cfv => new SharedCustomFieldDto(cfv.Field!.Label, cfv.Field.FieldType, cfv.Value))
                    .ToList()
            };
        }).ToList();

        var currentFront = await context.FrontHistory
            .Include(f => f.Member)
                .ThenInclude(m => m!.Bucket)
            .Include(f => f.CustomStatus)
            .Where(f => f.FrontEnd == null &&
                        f.Member != null &&
                        f.Member.DeletedAt == null &&
                        f.Member.Bucket != null &&
                        f.Member.Bucket.SortOrder <= accessToken.MinBucketSortOrder)
            .ToListAsync();

        var visibleFront = currentFront
            .Select(f => new SharedFrontEntryDto(
                f.Member!.Id,
                f.Member.Name,
                f.Member.DisplayName,
                f.Member.Color,
                f.Member.AvatarPath,
                f.CustomStatus?.Label,
                f.CustomStatus?.Color))
            .ToList();

        return Ok(new { members, currentFront = visibleFront });
    }

    // GET /share/{token}/journals
    [HttpGet("{token}/journals")]
    public async Task<IActionResult> GetSharedJournalsAsync(string token)
    {
        // 1. Ghost Mode FIRST — before any token DB lookup
        if (await ghostMode.IsFrozenAsync())
            return Ok(Array.Empty<object>());

        // 2. Token validation
        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;

        // 3. ReadFrontOnly tokens cannot access journals
        if (accessToken.MinBucketSortOrder == -1)
            return StatusCode(403, new { error = "Not permitted" });

        // 4. Return public journals ordered by CreatedAt DESC
        var journals = await context.JournalEntries
            .Where(j => !j.IsPrivate)
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new SharedJournalDto(j.Id, j.Title, j.Content, j.CreatedAt))
            .ToListAsync();

        return Ok(journals);
    }

    // GET /share/{token}/board/{memberId}
    [HttpGet("{token}/board/{memberId:guid}")]
    public async Task<IActionResult> GetSharedBoardAsync(string token, Guid memberId)
    {
        if (await ghostMode.IsFrozenAsync())
            return Ok(Array.Empty<object>());

        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;
        if (accessToken.MinBucketSortOrder == -1)
            return StatusCode(403, new { error = "Not permitted" });

        var member = await visibility
            .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
            .FirstOrDefaultAsync(m => m.Id == memberId);

        if (member == null) return NotFound();

        var messages = await context.BoardMessages
            .Where(b => b.MemberId == memberId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new BoardMessageResponse(b.Id, b.MemberId, b.AuthorName, b.Content, b.TokenId, b.CreatedAt))
            .ToListAsync();

        return Ok(messages);
    }

    // GET /share/{token}/history/{memberId}
    [HttpGet("{token}/history/{memberId:guid}")]
    public async Task<IActionResult> GetSharedHistoryAsync(string token, Guid memberId)
    {
        if (await ghostMode.IsFrozenAsync())
            return Ok(Array.Empty<object>());

        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;
        if (accessToken.MinBucketSortOrder == -1)
            return StatusCode(403, new { error = "Not permitted" });

        var member = await visibility
            .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
            .FirstOrDefaultAsync(m => m.Id == memberId);

        if (member == null) return NotFound();

        var history = await context.FrontHistory
            .Include(f => f.CustomStatus)
            .Where(f => f.MemberId == memberId)
            .OrderByDescending(f => f.FrontStart)
            .Take(100)
            .Select(f => new
            {
                frontStart = f.FrontStart,
                frontEnd = f.FrontEnd,
                statusLabel = f.CustomStatus != null ? f.CustomStatus.Label : (string?)null,
                statusColor = f.CustomStatus != null ? f.CustomStatus.Color : (string?)null,
            })
            .ToListAsync();

        return Ok(history);
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

        // Invisible to this token (bucket SortOrder too high) → 403, don't leak existence
        // member.BucketId is non-nullable after migration, but use ?? safety during transition
        if (member.BucketId == PrivacyBucket.PrivateId)
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
