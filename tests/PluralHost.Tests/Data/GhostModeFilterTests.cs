using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Data;

public class GhostModeFilterTests : IDisposable
{
    private readonly PluralHostContext _context;

    public GhostModeFilterTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
    }

    private async Task FreezeSystem()
    {
        var settings = await _context.SystemSettings.FirstOrDefaultAsync()
            ?? new SystemSettings();
        settings.IsFrozen = true;
        _context.SystemSettings.Update(settings);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear(); // Force re-read
    }

    [Fact]
    public async Task WhenFrozen_MembersQueryReturnsEmpty()
    {
        _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.Members.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task WhenFrozen_FrontHistoryQueryReturnsEmpty()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.FrontHistory.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task WhenUnfrozen_MembersQueryReturnsData()
    {
        _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        // Confirm unfrozen by default
        var result = await _context.Members.ToListAsync();
        Assert.Single(result);
    }

    [Fact]
    public async Task WhenFrozen_BoardMessagesQueryReturnsEmpty()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        _context.BoardMessages.Add(new BoardMessage
        {
            MemberId = member.Id,
            AuthorName = "System",
            Content = "hello"
        });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.BoardMessages.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task WhenFrozen_MemberNotesQueryReturnsEmpty()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        _context.MemberNotes.Add(new MemberNote
        {
            MemberId = member.Id,
            Content = "a note"
        });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.MemberNotes.ToListAsync();
        Assert.Empty(result);
    }

    public void Dispose() => _context.Dispose();
}
