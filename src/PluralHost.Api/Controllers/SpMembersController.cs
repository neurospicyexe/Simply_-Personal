using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpMembersController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpMemberContent> ToEnvelope(Member m) =>
        SpEnvelope<SpMemberContent>.Of(
            m.Id.ToString(),
            new SpMemberContent(
                Uid: "owner",
                Name: m.Name,
                Desc: m.Description,
                Pronouns: m.Pronouns,
                Color: m.Color,
                AvatarUrl: null,      // avatars served via /api/media/ — no direct URL
                Private: m.PrivacyTier == MemberPrivacy.Private,
                Archived: m.IsArchived
            ));

    // GET /v1/members/:system — Ghost Mode + soft-delete via global filter
    [HttpGet("v1/members/{system}")]
    public async Task<IActionResult> ListAsync(string system)
    {
        var members = await context.Members.ToListAsync();
        return Ok(members.Select(ToEnvelope));
    }

    // GET /v1/member/:system/:id
    [HttpGet("v1/member/{system}/{id}")]
    public async Task<IActionResult> GetAsync(string system, string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        return member is null ? NotFound() : Ok(ToEnvelope(member));
    }

    // POST /v1/member — returns raw ID string (SP convention)
    [HttpPost("v1/member")]
    public async Task<IActionResult> CreateAsync([FromBody] SpMemberCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var member = new Member
        {
            Name = body.Name,
            Description = body.Desc,
            Pronouns = body.Pronouns,
            Color = body.Color,
            PrivacyTier = body.Private ? MemberPrivacy.Private : MemberPrivacy.Public
        };
        context.Members.Add(member);
        await context.SaveChangesAsync();
        return Ok(member.Id.ToString());
    }

    // PATCH /v1/member/:id — partial update
    [HttpPatch("v1/member/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpMemberUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        if (member is null) return NotFound();

        if (body.Name is not null) member.Name = body.Name;
        if (body.Desc is not null) member.Description = body.Desc;
        if (body.Pronouns is not null) member.Pronouns = body.Pronouns;
        if (body.Color is not null) member.Color = body.Color;
        if (body.Private is not null) member.PrivacyTier = body.Private.Value ? MemberPrivacy.Private : MemberPrivacy.Public;
        if (body.Archived is not null) member.IsArchived = body.Archived.Value;

        await context.SaveChangesAsync();
        return Ok();
    }

    // DELETE /v1/member/:id — soft-delete
    [HttpDelete("v1/member/{id}")]
    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        if (member is null) return NotFound();

        member.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
