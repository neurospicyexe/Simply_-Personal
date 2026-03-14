using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class MemberServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly MemberService _service;

    public MemberServiceTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(opts);
        _context.Database.EnsureCreated();
        _service = new MemberService(_context);
    }

    public void Dispose() => _context.Dispose();

    // ── ValidateParentIdsAsync ────────────────────────────────────────────

    [Fact]
    public async Task ValidateParentIds_DirectSelfReference_ReturnsError()
    {
        var a = new Member { Name = "A" };
        _context.Members.Add(a);
        await _context.SaveChangesAsync();

        var result = await _service.ValidateParentIdsAsync(a.Id, [a.Id]);
        Assert.False(result.IsValid);
        Assert.Contains("Circular", result.Error);
    }

    [Fact]
    public async Task ValidateParentIds_IndirectCycle_ReturnsError()
    {
        var a = new Member { Name = "A" };
        var b = new Member { Name = "B", ParentIds = [] };
        _context.Members.AddRange(a, b);
        await _context.SaveChangesAsync();

        // A's parent = B; B's parent = A → cycle
        b.ParentIds = [a.Id];
        await _context.SaveChangesAsync();

        var result = await _service.ValidateParentIdsAsync(a.Id, [b.Id]);
        Assert.False(result.IsValid);
        Assert.Contains("Circular", result.Error);
    }

    [Fact]
    public async Task ValidateParentIds_ValidThreeLevelChain_ReturnsValid()
    {
        var c = new Member { Name = "C" };
        var b = new Member { Name = "B" };
        _context.Members.AddRange(b, c);
        await _context.SaveChangesAsync();

        b.ParentIds = [c.Id];
        await _context.SaveChangesAsync();

        var a = new Member { Name = "A" };
        _context.Members.Add(a);
        await _context.SaveChangesAsync();

        // A → B → C (valid 3-level)
        var result = await _service.ValidateParentIdsAsync(a.Id, [b.Id]);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task ValidateParentIds_DepthOver20_ReturnsError()
    {
        // Build a chain of 21 members: m[0] → m[1] → ... → m[20]
        var members = Enumerable.Range(0, 21)
            .Select(i => new Member { Name = $"M{i}" })
            .ToList();
        _context.Members.AddRange(members);
        await _context.SaveChangesAsync();

        for (int i = 0; i < 20; i++)
            members[i].ParentIds = [members[i + 1].Id];
        await _context.SaveChangesAsync();

        // Try to set m[20]'s parent to m[0] (depth > 20) — but easier: just test a chain of 21
        // Actually: create a new member and try to set its parent to members[0] (depth = 22)
        var leaf = new Member { Name = "Leaf" };
        _context.Members.Add(leaf);
        await _context.SaveChangesAsync();

        var result = await _service.ValidateParentIdsAsync(leaf.Id, [members[0].Id]);
        Assert.False(result.IsValid);
        Assert.Contains("depth", result.Error, StringComparison.OrdinalIgnoreCase);
    }

    // ── SetParentIdsAsync ─────────────────────────────────────────────────

    [Fact]
    public async Task SetParentIds_ValidParents_PersistsAndReturnsOk()
    {
        var parent = new Member { Name = "Parent" };
        var child = new Member { Name = "Child" };
        _context.Members.AddRange(parent, child);
        await _context.SaveChangesAsync();

        var result = await _service.SetParentIdsAsync(child.Id, [parent.Id]);
        Assert.True(result.IsValid);

        var refreshed = await _context.Members
            .IgnoreQueryFilters()
            .FirstAsync(m => m.Id == child.Id);
        Assert.Contains(parent.Id, refreshed.ParentIds);
    }
}
