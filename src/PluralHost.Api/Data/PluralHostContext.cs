// src/PluralHost.Api/Data/PluralHostContext.cs
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Data;

public class PluralHostContext(DbContextOptions<PluralHostContext> options)
    : DbContext(options)
{
    public DbSet<Member> Members => Set<Member>();
    public DbSet<FrontHistory> FrontHistory => Set<FrontHistory>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<AccessToken> AccessTokens => Set<AccessToken>();
    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<FrontStatus> FrontStatuses => Set<FrontStatus>();
    public DbSet<BoardMessage> BoardMessages => Set<BoardMessage>();
    public DbSet<MemberNote> MemberNotes => Set<MemberNote>();
    public DbSet<CustomField> CustomFields => Set<CustomField>();
    public DbSet<CustomFieldValue> CustomFieldValues => Set<CustomFieldValue>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<PrivacyBucket> PrivacyBuckets => Set<PrivacyBucket>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Singleton SystemSettings ──────────────────────────────────────
        modelBuilder.Entity<SystemSettings>()
            .HasData(new SystemSettings { Id = 1 });

        // ── AccessToken: string PK ────────────────────────────────────────
        modelBuilder.Entity<AccessToken>()
            .HasKey(t => t.TokenValue);

        // ── Group ↔ Member: many-to-many ──────────────────────────────────
        modelBuilder.Entity<Group>()
            .HasMany(g => g.Members)
            .WithMany(m => m.Groups)
            .UsingEntity(j => j.ToTable("MemberGroups"));

        // ── Member.ParentIds: CSV + comparer ─────────────────────────────
        var guidListComparer = new ValueComparer<List<Guid>>(
            (a, b) => a != null && b != null && a.SequenceEqual(b),
            v => v.Aggregate(0, (h, g) => HashCode.Combine(h, g.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<Member>()
            .Property(m => m.ParentIds)
            .HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(Guid.Parse).ToList())
            .Metadata.SetValueComparer(guidListComparer);

        // ── Member.ExtraImages: JSON list + comparer ─────────────────────
        var stringListComparer = new ValueComparer<List<string>>(
            (a, b) => a != null && b != null && a.SequenceEqual(b),
            v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<Member>()
            .Property(m => m.ExtraImages)
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>())
            .Metadata.SetValueComparer(stringListComparer);

        // ── FrontStatus: seeded defaults ─────────────────────────────────
        modelBuilder.Entity<FrontStatus>().HasData(
            Seed(FrontStatus.SeedIds.CoCon,            "Co-con"),
            Seed(FrontStatus.SeedIds.Blending,         "Blending"),
            Seed(FrontStatus.SeedIds.Switching,        "Switching"),
            Seed(FrontStatus.SeedIds.Stressed,         "Stressed"),
            Seed(FrontStatus.SeedIds.Dissociating,     "Dissociating"),
            Seed(FrontStatus.SeedIds.Foggy,            "Foggy"),
            Seed(FrontStatus.SeedIds.PassiveInfluence, "Passive influence"),
            Seed(FrontStatus.SeedIds.FullSwitch,       "Full switch"),
            Seed(FrontStatus.SeedIds.PartialSwitch,    "Partial switch"),
            Seed(FrontStatus.SeedIds.FrontingAlone,    "Fronting alone")
        );

        // ── GLOBAL FILTERS (soft-delete + Ghost Mode) ────────────────────
        // IMPORTANT: each entity gets exactly ONE HasQueryFilter call.
        // Both conditions are combined into a single expression.
        modelBuilder.Entity<Member>()
            .HasQueryFilter(m =>
                m.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<FrontHistory>()
            .HasQueryFilter(f =>
                f.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<Group>()
            .HasQueryFilter(g =>
                g.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<BoardMessage>()
            .HasQueryFilter(b =>
                b.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        // BoardMessage.TokenId → AccessToken.TokenValue (nullable FK, no cascade delete)
        modelBuilder.Entity<BoardMessage>()
            .HasOne(b => b.Token)
            .WithMany()
            .HasForeignKey(b => b.TokenId)
            .OnDelete(DeleteBehavior.NoAction);

        modelBuilder.Entity<MemberNote>()
            .HasQueryFilter(n =>
                n.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        // FrontStatus: soft-delete only (NOT Ghost Mode — it's a config picklist)
        modelBuilder.Entity<FrontStatus>()
            .HasQueryFilter(fs => fs.DeletedAt == null);

        // CustomField + CustomFieldValue: soft-delete only (NOT Ghost Mode — follow FrontStatus pattern)
        modelBuilder.Entity<CustomField>()
            .HasQueryFilter(cf => cf.DeletedAt == null);

        modelBuilder.Entity<CustomFieldValue>()
            .HasQueryFilter(cfv => cfv.DeletedAt == null);

        // CustomFieldValue: unique constraint on (FieldId, MemberId)
        // Note: covers soft-deleted rows — upsert must use IgnoreQueryFilters() to find them
        modelBuilder.Entity<CustomFieldValue>()
            .HasIndex(cfv => new { cfv.FieldId, cfv.MemberId })
            .IsUnique();

        // CustomFieldValue FKs — no cascade delete (preserve values if field/member soft-deleted)
        modelBuilder.Entity<CustomFieldValue>()
            .HasOne(cfv => cfv.Field)
            .WithMany(cf => cf.Values)
            .HasForeignKey(cfv => cfv.FieldId)
            .OnDelete(DeleteBehavior.NoAction);

        modelBuilder.Entity<CustomFieldValue>()
            .HasOne(cfv => cfv.Member)
            .WithMany(m => m.CustomFieldValues)
            .HasForeignKey(cfv => cfv.MemberId)
            .OnDelete(DeleteBehavior.NoAction);

        // JournalEntry: soft-delete only
        modelBuilder.Entity<JournalEntry>()
            .HasQueryFilter(j => j.DeletedAt == null);

        // ── PrivacyBucket ─────────────────────────────────────────────────
        // Soft-delete only — Ghost Mode does NOT apply (owner-only admin data)
        modelBuilder.Entity<PrivacyBucket>(b =>
        {
            b.HasKey(p => p.Id);
            b.Property(p => p.Name).IsRequired().HasMaxLength(150);
            b.Property(p => p.Description).HasMaxLength(500);
            b.Property(p => p.Emoji).HasMaxLength(10);
            b.HasQueryFilter(p => p.DeletedAt == null);
        });

        // Member → PrivacyBucket FK (nullable, restrict delete)
        modelBuilder.Entity<Member>()
            .HasOne<PrivacyBucket>(m => m.Bucket)
            .WithMany(b => b.Members)
            .HasForeignKey(m => m.BucketId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static FrontStatus Seed(Guid id, string label) => new()
    {
        Id = id,
        Label = label,
        IsDefault = true,
        IsHidden = false,
        CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
    };

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>()
            .Where(e => e.State == EntityState.Modified))
        {
            entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(ct);
    }
}
