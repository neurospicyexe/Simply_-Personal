using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpGroupsController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpGroupContent> ToEnvelope(Group g) =>
        SpEnvelope<SpGroupContent>.Of(
            g.Id.ToString(),
            new SpGroupContent(
                Uid: "owner",
                Name: g.Name,
                Desc: g.Description,
                Color: g.Color,
                Emoji: g.Emoji,
                Parent: "",
                Private: g.IsPrivate,
                Members: g.Members.Select(m => m.Id.ToString()).ToList()
            ));

    // GET /v1/groups/:system
    [HttpGet("v1/groups/{system}")]
    public async Task<IActionResult> ListAsync(string system)
    {
        var groups = await context.Groups.Include(g => g.Members).ToListAsync();
        return Ok(groups.Select(ToEnvelope));
    }

    // GET /v1/group/:system/:id
    [HttpGet("v1/group/{system}/{id}")]
    public async Task<IActionResult> GetAsync(string system, string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == guid);
        return group is null ? NotFound() : Ok(ToEnvelope(group));
    }

    // POST /v1/group — returns raw ID
    [HttpPost("v1/group")]
    public async Task<IActionResult> CreateAsync([FromBody] SpGroupCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var group = new Group
        {
            Name = body.Name,
            Description = body.Desc,
            Color = body.Color,
            Emoji = body.Emoji,
            IsPrivate = body.Private
        };

        if (body.Members is { Count: > 0 })
        {
            var memberGuids = body.Members
                .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                .Where(g => g.HasValue).Select(g => g!.Value).ToList();
            group.Members = await context.Members
                .Where(m => memberGuids.Contains(m.Id)).ToListAsync();
        }

        context.Groups.Add(group);
        await context.SaveChangesAsync();
        return Ok(group.Id.ToString());
    }

    // PATCH /v1/group/members — set all groups a member belongs to
    // Declared before {id} route to prevent "members" matching as an ID
    [HttpPatch("v1/group/members")]
    public async Task<IActionResult> SetMembershipsAsync([FromBody] SpSetGroupMembershipsRequest body)
    {
        if (!Guid.TryParse(body.Member, out var memberId)) return BadRequest();

        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == memberId);
        if (member is null) return NotFound();

        var groupGuids = body.Groups
            .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
            .Where(g => g.HasValue).Select(g => g!.Value).ToList();
        member.Groups = await context.Groups
            .Where(g => groupGuids.Contains(g.Id)).ToListAsync();

        await context.SaveChangesAsync();
        return Ok();
    }

    // PATCH /v1/group/:id
    [HttpPatch("v1/group/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpGroupUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == guid);
        if (group is null) return NotFound();

        if (body.Name is not null) group.Name = body.Name;
        if (body.Desc is not null) group.Description = body.Desc;
        if (body.Color is not null) group.Color = body.Color;
        if (body.Emoji is not null) group.Emoji = body.Emoji;
        if (body.Private is not null) group.IsPrivate = body.Private.Value;

        if (body.Members is not null)
        {
            var memberGuids = body.Members
                .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                .Where(g => g.HasValue).Select(g => g!.Value).ToList();
            group.Members = await context.Members
                .Where(m => memberGuids.Contains(m.Id)).ToListAsync();
        }

        await context.SaveChangesAsync();
        return Ok();
    }

    // DELETE /v1/group/:id — soft-delete
    [HttpDelete("v1/group/{id}")]
    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.FirstOrDefaultAsync(g => g.Id == guid);
        if (group is null) return NotFound();

        group.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
