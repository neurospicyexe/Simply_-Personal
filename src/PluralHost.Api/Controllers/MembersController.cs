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
[Route("api/members")]
public class MembersController(
    PluralHostContext context,
    IMemberService memberService) : ControllerBase
{
    private static MemberResponse ToResponse(Member m) => new(
        m.Id, m.Name, m.DisplayName, m.Pronouns, m.Color, m.Role,
        m.Description, m.AvatarPath, m.PrivacyTier == MemberPrivacy.Private, m.IsPinned, m.IsArchived,
        m.IsUntracked, m.PreventFrontNotification, m.ReceiveBoardNotifications,
        m.ExtraImages, m.SpMemberId, m.Status, m.ParentIds,
        m.Groups.Select(g => g.Id).ToList(),
        m.CreatedAt, m.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync([FromQuery] bool includeArchived = false)
    {
        var query = context.Members.Include(m => m.Groups).AsQueryable();
        if (!includeArchived) query = query.Where(m => !m.IsArchived);
        var members = await query
            .OrderByDescending(m => m.IsPinned)
            .ThenBy(m => m.Name)
            .ToListAsync();
        return Ok(members.Select(ToResponse));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetAsync(Guid id)
    {
        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == id);
        return member is null ? NotFound() : Ok(ToResponse(member));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] MemberCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var member = new Member
        {
            Name = body.Name,
            DisplayName = body.DisplayName,
            Pronouns = body.Pronouns,
            Color = body.Color,
            Role = body.Role,
            Description = body.Description,
            PrivacyTier = body.IsPrivate ? MemberPrivacy.Private : MemberPrivacy.Public
        };
        context.Members.Add(member);
        await context.SaveChangesAsync();
        return Ok(ToResponse(member));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] MemberUpdateRequest body)
    {
        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (member is null) return NotFound();

        if (body.ExtraImages is not null && body.ExtraImages.Count > 3)
            return BadRequest(new { error = "Maximum 3 extra images allowed" });

        if (body.ParentIds is not null)
        {
            var validation = await memberService.ValidateParentIdsAsync(id, body.ParentIds);
            if (!validation.IsValid) return BadRequest(new { error = validation.Error });
            member.ParentIds = body.ParentIds;
        }

        if (body.Name is not null)                        member.Name = body.Name;
        if (body.DisplayName is not null)                 member.DisplayName = body.DisplayName;
        if (body.Pronouns is not null)                    member.Pronouns = body.Pronouns;
        if (body.Color is not null)                       member.Color = body.Color;
        if (body.Role is not null)                        member.Role = body.Role;
        if (body.Description is not null)                 member.Description = body.Description;
        if (body.IsPrivate is not null)                   member.PrivacyTier = body.IsPrivate.Value ? MemberPrivacy.Private : MemberPrivacy.Public;
        if (body.IsPinned is not null)                    member.IsPinned = body.IsPinned.Value;
        if (body.IsArchived is not null)                  member.IsArchived = body.IsArchived.Value;
        if (body.IsUntracked is not null)                 member.IsUntracked = body.IsUntracked.Value;
        if (body.PreventFrontNotification is not null)    member.PreventFrontNotification = body.PreventFrontNotification.Value;
        if (body.ReceiveBoardNotifications is not null)   member.ReceiveBoardNotifications = body.ReceiveBoardNotifications.Value;
        if (body.ExtraImages is not null)                 member.ExtraImages = body.ExtraImages;
        if (body.SpMemberId is not null)                  member.SpMemberId = body.SpMemberId;
        if (body.Status is not null)                      member.Status = body.Status.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(member));
    }
}
