using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Data;

public class SoftDeleteFilterTests : IDisposable
{
    private readonly PluralHostContext _context;

    public SoftDeleteFilterTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task SoftDeletedMember_IsExcludedFromNormalQuery()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _context.Members.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task SoftDeletedMember_IsVisibleWithIgnoreFilter()
    {
        var member = new Member { Name = "River" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _context.Members.IgnoreQueryFilters().ToListAsync();
        Assert.Single(result);
    }

    [Fact]
    public async Task RestoredMember_IsVisibleAgain()
    {
        var member = new Member { Name = "Sky" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();
        member.Restore();
        await _context.SaveChangesAsync();

        var result = await _context.Members.ToListAsync();
        Assert.Single(result);
    }

    public void Dispose() => _context.Dispose();
}
