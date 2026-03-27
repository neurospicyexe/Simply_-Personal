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
[Route("api/front-statuses")]
public class FrontStatusController(
    PluralHostContext context,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static FrontStatusResponse ToResponse(FrontStatus s) =>
        new(s.Id, s.Label, s.Color, s.IsDefault, s.IsHidden, s.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var statuses = await context.FrontStatuses
            .OrderBy(s => s.IsDefault ? 0 : 1)
            .ThenBy(s => s.Label)
            .ToListAsync();
        return Ok(statuses.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] FrontStatusCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        var status = new FrontStatus { Label = body.Label.Trim(), Color = body.Color };
        context.FrontStatuses.Add(status);
        await context.SaveChangesAsync();
        return Ok(ToResponse(status));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] FrontStatusUpdateRequest body)
    {
        var status = await context.FrontStatuses.FirstOrDefaultAsync(s => s.Id == id);
        if (status is null) return NotFound();

        if (body.Label is not null) status.Label = body.Label.Trim();
        if (body.Color is not null) status.Color = body.Color;
        if (body.IsHidden is not null) status.IsHidden = body.IsHidden.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(status));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id, [FromBody] PinRequest body)
    {
        if (!await gatekeeper.ValidatePinAsync(body.Pin))
            return Forbid();

        var status = await context.FrontStatuses.FirstOrDefaultAsync(s => s.Id == id);
        if (status is null) return NotFound();

        if (status.IsDefault)
            return BadRequest(new { error = "Default statuses cannot be deleted" });

        status.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
