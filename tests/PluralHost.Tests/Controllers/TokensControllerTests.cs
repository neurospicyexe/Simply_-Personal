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

public class TokensControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IShareTokenService> _tokenService;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly TokensController _controller;

    public TokensControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _tokenService = new Mock<IShareTokenService>();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new TokensController(_context, _tokenService.Object, _gatekeeper.Object);
    }

    [Fact]
    public async Task List_ReturnsAllTokensOrderedByCreatedAtDesc()
    {
        var older = new AccessToken
        {
            TokenValue = "old",
            Label = "Old",
            MinBucketSortOrder = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };
        var newer = new AccessToken
        {
            TokenValue = "new",
            Label = "New",
            MinBucketSortOrder = 1,
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };
        _context.AccessTokens.AddRange(older, newer);
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var tokens = (result!.Value as IEnumerable<TokenResponse>)!.ToList();

        Assert.Equal(2, tokens.Count);
        Assert.Equal("new", tokens[0].TokenValue);   // newest first
        Assert.Equal("old", tokens[1].TokenValue);
    }

    [Fact]
    public async Task Create_MissingLabel_Returns400()
    {
        var result = await _controller.CreateAsync(
            new TokenCreateRequest("", MinBucketSortOrder: 1));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_CallsServiceAndReturnsToken()
    {
        var created = new AccessToken
        {
            TokenValue = "abc123",
            Label = "Blue",
            MinBucketSortOrder = 1,
            AllowsBoardPosting = true
        };
        _tokenService
            .Setup(s => s.CreateTokenAsync("Blue", 1, true, null))
            .ReturnsAsync(created);

        var result = await _controller.CreateAsync(
            new TokenCreateRequest("Blue", MinBucketSortOrder: 1, AllowsBoardPosting: true)) as OkObjectResult;
        var response = result!.Value as TokenResponse;

        Assert.Equal("abc123", response!.TokenValue);
        Assert.Equal(1, response.MinBucketSortOrder);
        Assert.True(response.AllowsBoardPosting);
    }

    [Fact]
    public async Task Revoke_MissingPin_Returns400()
    {
        var result = await _controller.RevokeAsync("anytoken", new PinRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Revoke_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("bad")).ReturnsAsync(false);

        var result = await _controller.RevokeAsync("sometoken", new PinRequest("bad"));
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task Revoke_TokenNotFound_Returns404()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("good")).ReturnsAsync(true);
        _tokenService.Setup(s => s.RevokeTokenAsync("missing")).ReturnsAsync(false);

        var result = await _controller.RevokeAsync("missing", new PinRequest("good"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Revoke_ValidToken_Returns200()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("good")).ReturnsAsync(true);
        _tokenService.Setup(s => s.RevokeTokenAsync("valid")).ReturnsAsync(true);

        var result = await _controller.RevokeAsync("valid", new PinRequest("good"));
        Assert.IsType<OkResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
