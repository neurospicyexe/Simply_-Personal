using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class MemberService(PluralHostContext context) : IMemberService
{
    private const int MaxDepth = 20;

    public async Task<ValidationResult> ValidateParentIdsAsync(Guid memberId, List<Guid> proposedParentIds)
    {
        var visited = new HashSet<Guid> { memberId };
        var queue = new Queue<Guid>(proposedParentIds);
        int depth = 0;

        while (queue.Count > 0)
        {
            if (depth >= MaxDepth)
                return ValidationResult.Fail("Parent chain exceeds maximum depth of 20");

            int levelSize = queue.Count;
            for (int i = 0; i < levelSize; i++)
            {
                var current = queue.Dequeue();

                if (visited.Contains(current))
                    return ValidationResult.Fail("Circular parent reference detected");

                visited.Add(current);

                var ancestor = await context.Members
                    .IgnoreQueryFilters()
                    .Where(m => m.Id == current)
                    .Select(m => new { m.ParentIds })
                    .FirstOrDefaultAsync();

                if (ancestor != null)
                    foreach (var parentId in ancestor.ParentIds)
                        queue.Enqueue(parentId);
            }

            depth++;
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
