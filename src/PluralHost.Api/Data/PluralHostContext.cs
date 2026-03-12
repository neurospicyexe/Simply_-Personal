using Microsoft.EntityFrameworkCore;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Singleton SystemSettings (always Id=1) ──────────────────────
        modelBuilder.Entity<SystemSettings>()
            .HasData(new SystemSettings { Id = 1 });

        // ── AccessToken: string primary key ─────────────────────────────
        modelBuilder.Entity<AccessToken>()
            .HasKey(t => t.TokenValue);

        // ── Member: JSON column for ParentIds list ───────────────────────
        modelBuilder.Entity<Member>()
            .Property(m => m.ParentIds)
            .HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(Guid.Parse).ToList());

        // ── GLOBAL FILTER 1: Soft-Delete ─────────────────────────────────
        // Applied to all entities that inherit BaseEntity.
        // WHERE deleted_at IS NULL
        // ── GLOBAL FILTER 2: Ghost Mode ──────────────────────────────────
        // If SystemSettings.IsFrozen = true, these sets return empty.
        // IMPORTANT: Each entity can only have ONE HasQueryFilter call.
        // Both filters are combined into a single expression per entity.
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
    }

    // Auto-update UpdatedAt on save
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
