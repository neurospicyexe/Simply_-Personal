// tests/PluralHost.Tests/Controllers/BoardControllerTests.cs
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

public class BoardControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly Mock<IGhostModeService> _ghostMode;
    private readonly BoardController _controller;
    private readonly Member _member;

    public BoardControllerTests()
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
        _ghostMode = new Mock<IGhostModeService>();
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(false);
        _controller = new BoardController(_context, _gatekeeper.Object, _ghostMode.Object);
    }

    [Fact]
    public async Task List_ReturnsMemberMessages()
    {
        _context.BoardMessages.Add(new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hello" });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(_member.Id) as OkObjectResult;
        var messages = result!.Value as IEnumerable<BoardMessageResponse>;
        Assert.Single(messages!);
    }

    [Fact]
    public async Task Post_ValidMessage_Saves()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("Sol", "hello board")) as OkObjectResult;
        var response = result!.Value as BoardMessageResponse;
        Assert.Equal("Sol", response!.AuthorName);
    }

    [Fact]
    public async Task Post_EmptyContent_Returns400()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("Sol", "  "));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Post_EmptyAuthorName_Returns400()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("  ", "hello"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Delete_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var msg = new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hi" };
        _context.BoardMessages.Add(msg);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, msg.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.BoardMessages
            .IgnoreQueryFilters()
            .FirstAsync(m => m.Id == msg.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("bad")).ReturnsAsync(false);
        var msg = new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hi" };
        _context.BoardMessages.Add(msg);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, msg.Id, "bad");
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task Post_WhenFrozen_ReturnsOkSilently()
    {
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostAsync(m.Id,
            new BoardMessageCreateRequest("Author", "Hello"));

        Assert.IsType<OkResult>(result);
        Assert.Empty(_context.BoardMessages.IgnoreQueryFilters().ToList());
    }

    [Fact]
    public async Task Post_OwnerPost_HasNullTokenId()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostAsync(m.Id,
            new BoardMessageCreateRequest("Ash", "Hello")) as OkObjectResult;
        var response = result!.Value as BoardMessageResponse;

        Assert.Null(response!.TokenId);
    }

    public void Dispose() => _context.Dispose();
}
