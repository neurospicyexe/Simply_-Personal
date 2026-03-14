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
                CustomStatus: fh.CustomStatus?.Label
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

    // GET /v1/frontHistory — all entries
    [HttpGet("v1/frontHistory")]
    public async Task<IActionResult> GetHistoryAsync()
    {
        var history = await context.FrontHistory
            .Include(f => f.CustomStatus)
            .ToListAsync();
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
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpFrontUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
        if (entry is null) return NotFound();

        if (body.Live is false && body.EndTime.HasValue)
            entry.FrontEnd = Epoch.FromMs(body.EndTime.Value);
        if (body.CustomStatus is not null) entry.Comment = body.CustomStatus;

        await context.SaveChangesAsync();
        return Ok();
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
