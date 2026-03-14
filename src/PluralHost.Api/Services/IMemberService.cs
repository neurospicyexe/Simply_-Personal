namespace PluralHost.Api.Services;

public record ValidationResult(bool IsValid, string? Error = null)
{
    public static ValidationResult Ok() => new(true);
    public static ValidationResult Fail(string error) => new(false, error);
}

public interface IMemberService
{
    /// <summary>Validates proposed ParentIds for cycle/depth without saving.</summary>
    Task<ValidationResult> ValidateParentIdsAsync(Guid memberId, List<Guid> proposedParentIds);

    /// <summary>Validates and then saves the ParentIds update.</summary>
    Task<ValidationResult> SetParentIdsAsync(Guid memberId, List<Guid> parentIds);
}
