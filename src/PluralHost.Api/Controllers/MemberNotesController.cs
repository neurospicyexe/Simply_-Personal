// src/PluralHost.Api/Controllers/MemberNotesController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/{memberId:guid}/notes")]
public class MemberNotesController(PluralHostContext context) : ControllerBase
{
    private static MemberNoteResponse ToResponse(MemberNote n) =>
        new(n.Id, n.MemberId, n.Title, n.Content, n.IsPinned, n.IsLocked,
            n.CreatedAt, n.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync(Guid memberId)
    {
        var notes = await context.MemberNotes
            .Where(n => n.MemberId == memberId)
            .OrderByDescending(n => n.IsPinned)
            .ThenByDescending(n => n.UpdatedAt)
            .ToListAsync();
        return Ok(notes.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync(Guid memberId,
        [FromBody] MemberNoteCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Note content is required" });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var note = new MemberNote
        {
            MemberId = memberId,
            Title = body.Title?.Trim(),
            Content = body.Content.Trim()
        };
        context.MemberNotes.Add(note);
        await context.SaveChangesAsync();
        return Ok(ToResponse(note));
    }

    [HttpPatch("{noteId:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid memberId, Guid noteId,
        [FromBody] MemberNoteUpdateRequest body)
    {
        var note = await context.MemberNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.MemberId == memberId);
        if (note is null) return NotFound();

        // Check lock guard BEFORE applying any changes.
        // If the note is currently locked and content/title edits are requested,
        // reject even if IsLocked: false is also in the same request.
        // Unlocking must be a separate request with no content/title changes.
        if (note.IsLocked && (body.Content is not null || body.Title is not null))
            return BadRequest(new { error = "Note is locked. Unlock it before editing." });

        if (body.IsLocked is not null) note.IsLocked = body.IsLocked.Value;

        if (body.Content is not null)
        {
            if (string.IsNullOrWhiteSpace(body.Content))
                return BadRequest(new { error = "Note content is required" });
            note.Content = body.Content.Trim();
        }
        if (body.Title is not null)    note.Title = body.Title.Trim();
        if (body.IsPinned is not null) note.IsPinned = body.IsPinned.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(note));
    }

    [HttpDelete("{noteId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid noteId)
    {
        var note = await context.MemberNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.MemberId == memberId);
        if (note is null) return NotFound();

        if (note.IsLocked)
            return BadRequest(new { error = "Note is locked. Unlock it before deleting." });

        note.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
