namespace PluralHost.Api.Domain;

public abstract class BaseEntity : ISoftDeletable
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public void SoftDelete() { DeletedAt = DateTime.UtcNow; UpdatedAt = DateTime.UtcNow; }
    public void Restore()    { DeletedAt = null;             UpdatedAt = DateTime.UtcNow; }
}
