// tests/PluralHost.Tests/Controllers/MemberNotesControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MemberNotesControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly MemberNotesController _controller;
    private readonly Member _member;

    public MemberNotesControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _member = new Member { Name = "Ash" };
        _context.Members.Add(_member);
        _context.SaveChanges();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new MemberNotesController(_context, _gatekeeper.Object);
    }

    [Fact]
    public async Task Create_ValidNote_Returns200()
    {
        var result = await _controller.CreateAsync(_member.Id,
            new MemberNoteCreateRequest("My note", "Title")) as OkObjectResult;
        var note = result!.Value as MemberNoteResponse;
        Assert.Equal("My note", note!.Content);
        Assert.Equal("Title", note.Title);
    }

    [Fact]
    public async Task Create_EmptyContent_Returns400()
    {
        var result = await _controller.CreateAsync(_member.Id,
            new MemberNoteCreateRequest("   "));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_LockedNote_Returns400()
    {
        var note = new MemberNote
            { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(Content: "changed"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_UnlockThenEdit_Succeeds()
    {
        var note = new MemberNote
            { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        // Unlock first
        await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(IsLocked: false));

        // Now edit
        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(Content: "changed"));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_UnlockAndEditInSameRequest_Returns400()
    {
        var note = new MemberNote { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(IsLocked: false, Content: "changed"));
        Assert.IsType<BadRequestObjectResult>(result);

        // Confirm note is still locked (no partial save)
        var inDb = await _context.MemberNotes.IgnoreQueryFilters()
            .FirstAsync(n => n.Id == note.Id);
        Assert.True(inDb.IsLocked);
        Assert.Equal("note", inDb.Content);
    }

    [Fact]
    public async Task Delete_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var note = new MemberNote { MemberId = _member.Id, Content = "note" };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, note.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.MemberNotes
            .IgnoreQueryFilters()
            .FirstAsync(n => n.Id == note.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
