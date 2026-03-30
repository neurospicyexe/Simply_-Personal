using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/relationships")]
public class MemberRelationshipsController(PluralHostContext context) : ControllerBase
{
    private static MemberRelationshipResponse ToResponse(MemberRelationship r) =>
        new(r.Id, r.FromMemberId, r.ToMemberId, r.Label, r.IsDirected, r.CreatedAt, r.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAllAsync()
    {
        var rels = await context.MemberRelationships
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();
        return Ok(rels.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] MemberRelationshipCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        if (body.Label.Trim().Length > 100)
            return BadRequest(new { error = "Label must be 100 characters or fewer" });

        if (body.FromMemberId == body.ToMemberId)
            return BadRequest(new { error = "A member cannot have a relationship with themselves" });

        var fromExists = await context.Members.AnyAsync(m => m.Id == body.FromMemberId);
        if (!fromExists) return BadRequest(new { error = "FromMember not found or deleted" });

        var toExists = await context.Members.AnyAsync(m => m.Id == body.ToMemberId);
        if (!toExists) return BadRequest(new { error = "ToMember not found or deleted" });

        var duplicate = await context.MemberRelationships.AnyAsync(r =>
            r.FromMemberId == body.FromMemberId &&
            r.ToMemberId == body.ToMemberId &&
            r.Label.ToLower() == body.Label.Trim().ToLower() &&
            r.DeletedAt == null);
        if (duplicate)
            return Conflict(new { error = "A relationship with this label already exists between these alters." });

        var rel = new MemberRelationship
        {
            FromMemberId = body.FromMemberId,
            ToMemberId = body.ToMemberId,
            Label = body.Label.Trim(),
            IsDirected = body.IsDirected
        };
        context.MemberRelationships.Add(rel);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAllAsync), ToResponse(rel));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] MemberRelationshipUpdateRequest body)
    {
        var rel = await context.MemberRelationships.FirstOrDefaultAsync(r => r.Id == id);
        if (rel is null) return NotFound();

        if (body.Label is not null)
        {
            if (string.IsNullOrWhiteSpace(body.Label))
                return BadRequest(new { error = "Label is required" });
            if (body.Label.Trim().Length > 100)
                return BadRequest(new { error = "Label must be 100 characters or fewer" });
            rel.Label = body.Label.Trim();
        }
        if (body.IsDirected is not null) rel.IsDirected = body.IsDirected.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(rel));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var rel = await context.MemberRelationships.FirstOrDefaultAsync(r => r.Id == id);
        if (rel is null) return NotFound();

        rel.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }
}
