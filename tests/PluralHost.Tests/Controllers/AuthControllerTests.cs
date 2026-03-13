using Microsoft.AspNetCore.Mvc;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Services;

namespace PluralHost.Tests.Controllers;

public class AuthControllerTests
{
    private readonly Mock<IAuthService> _authMock = new();
    private AuthController CreateController() => new(_authMock.Object);

    [Fact]
    public async Task Setup_WhenNotYetConfigured_Returns200()
    {
        _authMock.Setup(a => a.SetupPasswordAsync("strongpass")).ReturnsAsync(true);
        var result = await CreateController().SetupAsync(new SetupRequest("strongpass"));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Setup_WhenAlreadyConfigured_Returns409()
    {
        _authMock.Setup(a => a.SetupPasswordAsync("strongpass")).ReturnsAsync(false);
        var result = await CreateController().SetupAsync(new SetupRequest("strongpass"));
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public async Task Setup_WithEmptyPassword_Returns400()
    {
        var result = await CreateController().SetupAsync(new SetupRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
        _authMock.Verify(a => a.SetupPasswordAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Setup_WithTooShortPassword_Returns400()
    {
        var result = await CreateController().SetupAsync(new SetupRequest("short"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Login_WithCorrectPassword_Returns200WithToken()
    {
        _authMock.Setup(a => a.LoginAsync("correct")).ReturnsAsync("jwt-token-here");
        var result = await CreateController().LoginAsync(new LoginRequest("correct"));
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task Login_WithWrongPassword_Returns401()
    {
        _authMock.Setup(a => a.LoginAsync("wrong")).ReturnsAsync((string?)null);
        var result = await CreateController().LoginAsync(new LoginRequest("wrong"));
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task ChangePassword_WithValidPin_Returns200()
    {
        _authMock.Setup(a => a.ChangePasswordAsync("newpass99", "correct-pin")).ReturnsAsync(true);
        var result = await CreateController()
            .ChangePasswordAsync(new ChangePasswordRequest("newpass99", "correct-pin"));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task ChangePassword_WithWrongPin_Returns403()
    {
        _authMock.Setup(a => a.ChangePasswordAsync("newpass99", "bad-pin")).ReturnsAsync(false);
        var result = await CreateController()
            .ChangePasswordAsync(new ChangePasswordRequest("newpass99", "bad-pin"));
        var statusResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, statusResult.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_WithTooShortNewPassword_Returns400()
    {
        var result = await CreateController()
            .ChangePasswordAsync(new ChangePasswordRequest("short", "any-pin"));
        Assert.IsType<BadRequestObjectResult>(result);
        _authMock.Verify(a => a.ChangePasswordAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }
}
