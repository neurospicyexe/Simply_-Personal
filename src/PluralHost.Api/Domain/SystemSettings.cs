namespace PluralHost.Api.Domain;

public class SystemSettings
{
    // Singleton — always Id = 1
    public int Id { get; set; } = 1;

    // Ghost Mode
    public bool IsFrozen { get; set; } = false;
    public DateTime? FreezeEndDate { get; set; }

    // Gatekeeper PIN (BCrypt hash) — separate from login password
    public string? GatekeeperPinHash { get; set; }

    // Login password (BCrypt hash, work factor 12)
    public string? LoginPasswordHash { get; set; }
    public bool IsLoginSetup => !string.IsNullOrEmpty(LoginPasswordHash);

    // Deletion cooldown: set when deletion is requested, finalized 72h later
    public DateTime? DeletionCooldownEnd { get; set; }

    public bool ShouldAutoUnfreeze() =>
        IsFrozen && FreezeEndDate.HasValue && FreezeEndDate.Value <= DateTime.UtcNow;

    public bool HasPendingDeletion() =>
        DeletionCooldownEnd.HasValue && DeletionCooldownEnd.Value > DateTime.UtcNow;

    public bool DeletionIsFinalized() =>
        DeletionCooldownEnd.HasValue && DeletionCooldownEnd.Value <= DateTime.UtcNow;
}
