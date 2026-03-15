using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/journals")]
public class JournalsController(PluralHostContext context) : ControllerBase
{
    private const int MaxJournalPageSize = 500;

    private static JournalEntryResponse ToResponse(JournalEntry e) => new(
        e.Id, e.Title, e.Content, e.IsPrivate, e.CreatedAt, e.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var entries = await context.JournalEntries
            .OrderByDescending(e => e.CreatedAt)
            .Take(MaxJournalPageSize)
            .ToListAsync();
        return Ok(entries.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] JournalCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Content is required" });

        var entry = new JournalEntry
        {
            Title = body.Title,
            Content = body.Content,
            IsPrivate = body.IsPrivate
        };
        context.JournalEntries.Add(entry);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(PatchAsync), new { id = entry.Id }, ToResponse(entry));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> PatchAsync(Guid id, [FromBody] JournalUpdateRequest body)
    {
        var entry = await context.JournalEntries.FirstOrDefaultAsync(e => e.Id == id);
        if (entry is null) return NotFound();

        if (body.Title is not null) entry.Title = body.Title;
        if (body.Content is not null) entry.Content = body.Content;
        if (body.IsPrivate.HasValue) entry.IsPrivate = body.IsPrivate.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(entry));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var entry = await context.JournalEntries.FirstOrDefaultAsync(e => e.Id == id);
        if (entry is null) return NotFound();

        entry.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }
}
