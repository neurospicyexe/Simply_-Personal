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

public class FrontStatusControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly FrontStatusController _controller;

    public FrontStatusControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new FrontStatusController(_context, _gatekeeper.Object);
    }

    [Fact]
    public async Task GetAll_ReturnsVisibleStatuses()
    {
        // Seed data loads via HasData in EnsureCreated
        var result = await _controller.ListAsync() as OkObjectResult;
        Assert.NotNull(result);
        var statuses = result.Value as IEnumerable<FrontStatusResponse>;
        Assert.NotNull(statuses);
        Assert.Equal(10, statuses.Count()); // 10 seeded defaults
    }

    [Fact]
    public async Task GetAll_IncludesHiddenStatuses()
    {
        var status = new FrontStatus { Label = "Test", IsDefault = false };
        status.IsHidden = true;
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var statuses = result!.Value as IEnumerable<FrontStatusResponse>;
        Assert.Contains(statuses!, s => s.Label == "Test" && s.IsHidden);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsNewStatus()
    {
        var result = await _controller.CreateAsync(
            new FrontStatusCreateRequest("Custom", "#ff0000")) as OkObjectResult;
        Assert.NotNull(result);
        var response = result.Value as FrontStatusResponse;
        Assert.Equal("Custom", response!.Label);
        Assert.Equal("#ff0000", response.Color);
    }

    [Fact]
    public async Task Delete_DefaultStatus_Returns400()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var defaultId = FrontStatus.SeedIds.CoCon;

        var result = await _controller.DeleteAsync(defaultId, "1234");
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Delete_UserStatus_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var status = new FrontStatus { Label = "Mine" };
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(status.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.FrontStatuses
            .IgnoreQueryFilters()
            .FirstAsync(s => s.Id == status.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("wrong")).ReturnsAsync(false);
        var status = new FrontStatus { Label = "Mine" };
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(status.Id, "wrong");
        Assert.IsType<ForbidResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
