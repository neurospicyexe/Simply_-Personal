namespace PluralHost.Api.Domain;

public interface ISoftDeletable
{
    DateTime? DeletedAt { get; set; }
    bool IsDeleted => DeletedAt.HasValue;
    void SoftDelete();
    void Restore();
}
