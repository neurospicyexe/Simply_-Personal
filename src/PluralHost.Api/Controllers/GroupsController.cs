using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/groups")]
[Authorize]
public class GroupsController(PluralHostContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAllAsync()
    {
        var groups = await context.Groups.ToListAsync();
        var members = await context.Members.ToListAsync();
        return Ok(groups.Select(g => new {
            id = g.Id,
            name = g.Name,
            color = g.Color,
            description = g.Description,
            emoji = g.Emoji,
            isPrivate = g.IsPrivate,
            parentGroupId = g.ParentGroupId,
            createdAt = g.CreatedAt,
            updatedAt = g.UpdatedAt,
            memberCount = members.Count(m => m.ParentIds.Contains(g.Id))
        }));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] GroupCreateRequest req)
    {
        var group = new Group { Name = req.Name, Color = req.Color };
        context.Groups.Add(group);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAllAsync), new { id = group.Id }, group);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] GroupUpdateRequest req)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();
        if (req.Name is not null) group.Name = req.Name;
        if (req.Color is not null) group.Color = req.Color;
        group.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(group);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();
        group.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Atomically replaces all members of a group.
    /// Body: { memberIds: [guid1, guid2, ...] }
    /// Removes group from members not in list; adds group to members in list.
    /// </summary>
    [HttpPost("{id:guid}/members")]
    public async Task<IActionResult> SetMembersAsync(Guid id, [FromBody] SetGroupMembersRequest req)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();

        // Members currently in this group (ParentIds contains group.Id as Guid)
        var currentMembers = await context.Members
            .Where(m => m.ParentIds.Contains(id))
            .ToListAsync();

        // Remove group from members no longer in the list
        foreach (var m in currentMembers.Where(m => !req.MemberIds.Contains(m.Id)))
        {
            m.ParentIds = m.ParentIds.Where(pid => pid != id).ToList();
            m.UpdatedAt = DateTime.UtcNow;
        }

        // Add group to new members
        var currentIds = currentMembers.Select(m => m.Id).ToHashSet();
        var toAdd = req.MemberIds.Where(mid => !currentIds.Contains(mid)).ToList();
        if (toAdd.Count > 0)
        {
            var newMembers = await context.Members
                .Where(m => toAdd.Contains(m.Id))
                .ToListAsync();
            foreach (var m in newMembers)
            {
                if (!m.ParentIds.Contains(id))
                    m.ParentIds = [.. m.ParentIds, id];
                m.UpdatedAt = DateTime.UtcNow;
            }
        }

        await context.SaveChangesAsync();
        return NoContent();
    }
}
