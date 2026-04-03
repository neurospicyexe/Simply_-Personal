using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/buckets")]
[Authorize]
public class BucketsController(PluralHostContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<BucketDto>>> GetAllAsync()
    {
        var buckets = await context.PrivacyBuckets
            .OrderBy(b => b.SortOrder)
            .Select(b => new BucketDto(
                b.Id, b.Name, b.Description, b.Emoji, b.Color, b.SortOrder, b.IsDefault,
                b.Members.Count(m => m.DeletedAt == null)))
            .ToListAsync();
        return Ok(buckets);
    }

    [HttpPost]
    public async Task<ActionResult<BucketDto>> CreateAsync([FromBody] BucketCreateRequest req)
    {
        var maxSort = await context.PrivacyBuckets.MaxAsync(b => (int?)b.SortOrder) ?? 3;
        var bucket = new PrivacyBucket
        {
            Name = req.Name,
            Description = req.Description,
            Emoji = req.Emoji,
            Color = req.Color,
            SortOrder = maxSort + 1,
            IsDefault = false,
        };
        context.PrivacyBuckets.Add(bucket);
        await context.SaveChangesAsync();
        var dto = new BucketDto(bucket.Id, bucket.Name, bucket.Description,
            bucket.Emoji, bucket.Color, bucket.SortOrder, bucket.IsDefault, 0);
        return CreatedAtAction(nameof(GetAllAsync), dto);
    }

    [HttpPut("reorder")]   // MUST be declared before {id} route to avoid route ambiguity
    public async Task<IActionResult> ReorderAsync([FromBody] List<ReorderItem> items)
    {
        foreach (var item in items)
        {
            var bucket = await context.PrivacyBuckets.FindAsync(item.Id);
            if (bucket == null || bucket.IsDefault) continue;
            bucket.SortOrder = item.SortOrder;
            bucket.UpdatedAt = DateTime.UtcNow;
        }
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BucketDto>> UpdateAsync(Guid id, [FromBody] BucketUpdateRequest req)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();

        if (req.Name is not null) bucket.Name = req.Name;
        if (req.Description is not null) bucket.Description = req.Description;
        if (req.Emoji is not null) bucket.Emoji = req.Emoji;
        if (req.Color is not null) bucket.Color = req.Color;
        if (req.SortOrder.HasValue && !bucket.IsDefault) bucket.SortOrder = req.SortOrder.Value;
        bucket.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync();
        var memberCount = await context.Members.CountAsync(m => m.BucketId == id);
        return Ok(new BucketDto(bucket.Id, bucket.Name, bucket.Description,
            bucket.Emoji, bucket.Color, bucket.SortOrder, bucket.IsDefault, memberCount));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();
        if (bucket.IsDefault)
            return BadRequest("Default buckets cannot be removed.");
        bucket.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id:guid}/excluded-fields")]
    public async Task<ActionResult<IEnumerable<BucketExcludedFieldDto>>> GetExcludedFieldsAsync(Guid id)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();

        var exclusions = await context.BucketFieldExclusions
            .Where(e => e.BucketId == id)
            .Select(e => new BucketExcludedFieldDto(e.FieldId, e.Field.Label))
            .ToListAsync();

        return Ok(exclusions);
    }

    [HttpPost("{id:guid}/excluded-fields")]
    public async Task<ActionResult<BucketExcludedFieldDto>> AddExcludedFieldAsync(Guid id, [FromBody] BucketExcludeFieldRequest req)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();

        var field = await context.CustomFields.FindAsync(req.FieldId);
        if (field == null || field.DeletedAt != null) return NotFound();

        // Idempotent: if already excluded (including soft-deleted), restore or return existing
        var existing = await context.BucketFieldExclusions
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(e => e.BucketId == id && e.FieldId == req.FieldId);

        if (existing != null)
        {
            if (existing.DeletedAt != null) existing.Restore();
            await context.SaveChangesAsync();
            return Ok(new BucketExcludedFieldDto(existing.FieldId, field.Label));
        }

        var exclusion = new BucketFieldExclusion { BucketId = id, FieldId = req.FieldId };
        context.BucketFieldExclusions.Add(exclusion);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetExcludedFieldsAsync), new { id }, new BucketExcludedFieldDto(req.FieldId, field.Label));
    }

    [HttpDelete("{id:guid}/excluded-fields/{fieldId:guid}")]
    public async Task<IActionResult> RemoveExcludedFieldAsync(Guid id, Guid fieldId)
    {
        var exclusion = await context.BucketFieldExclusions
            .FirstOrDefaultAsync(e => e.BucketId == id && e.FieldId == fieldId);
        if (exclusion == null) return NotFound();

        exclusion.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }
}
