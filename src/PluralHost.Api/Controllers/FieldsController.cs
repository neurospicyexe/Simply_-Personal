using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/fields")]
public class FieldsController(PluralHostContext context) : ControllerBase
{
    private static CustomFieldResponse ToResponse(CustomField f) => new(
        f.Id, f.Label, f.FieldType, f.SortOrder, f.CreatedAt, f.UpdatedAt, f.DeletedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var fields = await context.CustomFields
            .IgnoreQueryFilters()
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();
        return Ok(fields.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] CustomFieldCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });
        if (!body.FieldType.HasValue)
            return BadRequest(new { error = "FieldType is required" });

        var field = new CustomField
        {
            Label = body.Label,
            FieldType = body.FieldType.Value,
            SortOrder = body.SortOrder
        };
        context.CustomFields.Add(field);
        await context.SaveChangesAsync();
        return Ok(ToResponse(field));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> PatchAsync(Guid id, [FromBody] CustomFieldUpdateRequest body)
    {
        if (body.FieldType.HasValue)
            return BadRequest(new { error = "FieldType cannot be changed after creation" });

        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == id);

        if (field is null || field.DeletedAt is not null) return NotFound();

        if (body.Label is not null) field.Label = body.Label;
        if (body.SortOrder.HasValue) field.SortOrder = body.SortOrder.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(field));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == id);

        if (field is null) return NotFound();

        // Cascade: soft-delete all active values for this field
        var values = await context.CustomFieldValues
            .IgnoreQueryFilters()
            .Where(v => v.FieldId == id && v.DeletedAt == null)
            .ToListAsync();

        foreach (var v in values) v.SoftDelete();
        field.SoftDelete();

        await context.SaveChangesAsync();
        return Ok();
    }
}
