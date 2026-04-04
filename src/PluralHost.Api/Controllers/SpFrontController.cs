using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpFrontController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpFrontContent> ToEnvelope(FrontHistory fh) =>
        SpEnvelope<SpFrontContent>.Of(
            fh.Id.ToString(),
            new SpFrontContent(
                Uid: "owner",
                Member: fh.MemberId.ToString(),
                Live: fh.FrontEnd == null,
                StartTime: Epoch.ToMs(fh.FrontStart),
                EndTime: fh.FrontEnd.HasValue ? Epoch.ToMs(fh.FrontEnd.Value) : null,
                Custom: false,
                CustomStatus: fh.CustomStatus?.Label,
                Comment: fh.Comment
            ));

    // GET /v1/fronters — currently fronting (FrontEnd == null)
    [HttpGet("v1/fronters")]
    public async Task<IActionResult> GetCurrentFrontersAsync()
    {
        var fronters = await context.FrontHistory
            .Include(f => f.CustomStatus)
            .Where(f => f.FrontEnd == null)
            .ToListAsync();
        return Ok(fronters.Select(ToEnvelope));
    }

    // GET /v1/frontHistory — all entries, optionally filtered by ?from=&to= (ISO 8601)
    [HttpGet("v1/frontHistory")]
    public async Task<IActionResult> GetHistoryAsync(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        var query = context.FrontHistory
            .Include(f => f.CustomStatus)
            .AsQueryable();

        if (from.HasValue)
        {
            var ceiling = to ?? DateTime.UtcNow;
            query = query.Where(f =>
                f.FrontStart < ceiling &&
                (f.FrontEnd == null || f.FrontEnd > from.Value));
        }

        var history = await query.ToListAsync();
        return Ok(history.Select(ToEnvelope));
    }

    // GET /v1/frontHistory/:id — single entry
    [HttpGet("v1/frontHistory/{id}")]
    public async Task<IActionResult> GetEntryAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory
            .Include(f => f.CustomStatus)
            .FirstOrDefaultAsync(f => f.Id == guid);
        return entry is null ? NotFound() : Ok(ToEnvelope(entry));
    }

    // POST /v1/frontHistory — start fronting or log historical entry
    [HttpPost("v1/frontHistory")]
    public async Task<IActionResult> CreateAsync([FromBody] SpFrontCreateRequest body)
    {
        if (!Guid.TryParse(body.Member, out var memberId))
            return BadRequest(new { error = "Invalid member ID." });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists)
            return BadRequest(new { error = "Member not found." });

        var entry = new FrontHistory
        {
            MemberId = memberId,
            FrontStart = Epoch.FromMs(body.StartTime),
            FrontEnd = body.EndTime.HasValue ? Epoch.FromMs(body.EndTime.Value) : null,
            Comment = body.CustomStatus   // stored as plain comment via SP compat layer
        };
        context.FrontHistory.Add(entry);
        await context.SaveChangesAsync();
        return Ok(entry.Id.ToString());
    }

    // PATCH /v1/frontHistory/:id — update entry (set live:false + endTime to end fronting)
    [HttpPatch("v1/frontHistory/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpFrontUpdateRequest body, CancellationToken ct = default)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid, ct);
        if (entry is null) return NotFound();

        if (body.Live is false && body.EndTime.HasValue)
            entry.FrontEnd = Epoch.FromMs(body.EndTime.Value);
        if (body.CustomStatus is not null) entry.Comment = body.CustomStatus;
        if (body.Comment is not null) entry.Comment = body.Comment;
        if (body.MemberId is not null && Guid.TryParse(body.MemberId, out var newMemberId))
            entry.MemberId = newMemberId;
        if (body.StartTime.HasValue)
            entry.FrontStart = Epoch.FromMs(body.StartTime.Value);

        await context.SaveChangesAsync(ct);
        return NoContent();
    }

    // POST /v1/fronters/clear-all — end all active front sessions
    [HttpPost("v1/fronters/clear-all")]
    [Authorize]
    public async Task<IActionResult> ClearAllFrontersAsync(CancellationToken ct)
    {
        var active = await context.FrontHistory
            .Where(f => f.FrontEnd == null && f.DeletedAt == null)
            .ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var entry in active)
            entry.FrontEnd = now;
        await context.SaveChangesAsync(ct);
        return NoContent();
    }

    // DELETE /v1/frontHistory/:id — soft-delete
    [HttpDelete("v1/frontHistory/{id}")]
    public async Task<IActionResult> DeleteEntryAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
        if (entry is null) return NotFound();

        entry.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
