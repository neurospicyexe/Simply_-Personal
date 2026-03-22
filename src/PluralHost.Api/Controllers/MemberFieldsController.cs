using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/{memberId:guid}/fields")]
public class MemberFieldsController(PluralHostContext context) : ControllerBase
{
    private static bool IsValidForType(FieldType type, string value) => type switch
    {
        FieldType.Text      => true,
        FieldType.Multiline => true,
        FieldType.Number    => !string.IsNullOrEmpty(value) && decimal.TryParse(value, out _),
        FieldType.Date      => !string.IsNullOrEmpty(value) &&
                               DateOnly.TryParseExact(value, "yyyy-MM-dd", out _),
        FieldType.Boolean   => value is "true" or "false",
        _                   => false
    };

    private static CustomFieldValueResponse ToValueResponse(CustomFieldValue v) => new(
        v.Id, v.FieldId, v.MemberId, v.Value, v.BucketId, v.CreatedAt, v.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAsync(Guid memberId)
    {
        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var fields = await context.CustomFields
            .IgnoreQueryFilters()
            .Where(f => f.DeletedAt == null)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();

        var values = await context.CustomFieldValues
            .Where(v => v.MemberId == memberId)
            .ToListAsync();

        var valuesByFieldId = values.ToDictionary(v => v.FieldId);

        var entries = fields.Select(f =>
        {
            var hasValue = valuesByFieldId.TryGetValue(f.Id, out var val);
            return new MemberFieldEntry(
                f.Id, f.Label, f.FieldType, f.SortOrder,
                hasValue ? val!.Value : null,
                hasValue ? val!.BucketId : PrivacyBucket.PublicId);
        });

        return Ok(entries);
    }

    [HttpPut("{fieldId:guid}")]
    public async Task<IActionResult> UpsertAsync(
        Guid memberId, Guid fieldId,
        [FromBody] CustomFieldValueUpsertRequest body)
    {
        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == fieldId);

        if (field is null) return NotFound();
        if (field.DeletedAt is not null)
            return BadRequest(new { error = "Field has been deleted" });

        if (!IsValidForType(field.FieldType, body.Value))
            return BadRequest(new { error = $"Value is not valid for field type {field.FieldType}" });

        // Upsert — must use IgnoreQueryFilters() because the unique constraint covers soft-deleted rows
        var existing = await context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == memberId);

        if (existing is not null)
        {
            existing.Restore();
            existing.Value = body.Value;
            existing.BucketId = body.BucketId == default ? PrivacyBucket.PublicId : body.BucketId;
        }
        else
        {
            existing = new CustomFieldValue
            {
                FieldId = fieldId,
                MemberId = memberId,
                Value = body.Value,
                BucketId = body.BucketId == default ? PrivacyBucket.PublicId : body.BucketId
            };
            context.CustomFieldValues.Add(existing);
        }

        await context.SaveChangesAsync();
        return Ok(ToValueResponse(existing));
    }

    [HttpDelete("{fieldId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid fieldId)
    {
        var value = await context.CustomFieldValues
            .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == memberId);

        if (value is null) return NotFound();

        value.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
