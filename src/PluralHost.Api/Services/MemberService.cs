using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class MemberService(PluralHostContext context) : IMemberService
{
    private const int MaxDepth = 20;

    public async Task<ValidationResult> ValidateParentIdsAsync(Guid memberId, List<Guid> proposedParentIds)
    {
        foreach (var parentId in proposedParentIds)
        {
            var visited = new HashSet<Guid> { memberId };
            var current = parentId;
            int depth = 0;

            while (current != Guid.Empty)
            {
                if (visited.Contains(current))
                    return ValidationResult.Fail("Circular parent reference detected");

                if (depth >= MaxDepth)
                    return ValidationResult.Fail("Parent chain exceeds maximum depth of 20");

                visited.Add(current);
                depth++;

                var ancestor = await context.Members
                    .IgnoreQueryFilters()
                    .Where(m => m.Id == current && m.DeletedAt == null)
                    .Select(m => new { m.ParentIds })
                    .FirstOrDefaultAsync();

                if (ancestor == null || ancestor.ParentIds.Count == 0)
                    break;

                current = ancestor.ParentIds[0]; // walk first parent
            }
        }

        return ValidationResult.Ok();
    }

    public async Task<ValidationResult> SetParentIdsAsync(Guid memberId, List<Guid> parentIds)
    {
        var validation = await ValidateParentIdsAsync(memberId, parentIds);
        if (!validation.IsValid) return validation;

        var member = await context.Members
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == memberId && m.DeletedAt == null);

        if (member == null) return ValidationResult.Fail("Member not found");

        member.ParentIds = parentIds;
        await context.SaveChangesAsync();
        return ValidationResult.Ok();
    }
}
