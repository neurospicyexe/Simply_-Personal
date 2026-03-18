using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpFrontControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpFrontController _controller;

    public SpFrontControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpFrontController(_context);
    }

    private async Task<Member> AddMemberAsync(string name = "Ada")
    {
        var m = new Member { Name = name };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();
        return m;
    }

    [Fact]
    public async Task GetCurrentFronters_NoActiveFront_ReturnsEmpty()
    {
        var result = await _controller.GetCurrentFrontersAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task GetCurrentFronters_ActiveEntry_ReturnsLiveEntry()
    {
        var m = await AddMemberAsync();
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id });
        await _context.SaveChangesAsync();

        var result = await _controller.GetCurrentFrontersAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Single(items);
    }

    [Fact]
    public async Task GetHistory_ReturnsAllEntries()
    {
        var m = await AddMemberAsync();
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id, FrontEnd = DateTime.UtcNow });
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id });
        await _context.SaveChangesAsync();

        var result = await _controller.GetHistoryAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Equal(2, items.Count());
    }

    [Fact]
    public async Task GetEntry_Existing_ReturnsEnvelope()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var result = await _controller.GetEntryAsync(fh.Id.ToString()) as OkObjectResult;
        Assert.NotNull(result);
        var env = Assert.IsType<SpEnvelope<SpFrontContent>>(result.Value);
        Assert.True(env.Exists);
        Assert.True(env.Content.Live);
    }

    [Fact]
    public async Task GetEntry_Nonexistent_Returns404()
    {
        var result = await _controller.GetEntryAsync(Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_LiveEntry_PersistsWithNullFrontEnd()
    {
        var m = await AddMemberAsync();
        var startMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var result = await _controller.CreateAsync(new SpFrontCreateRequest(
            Member: m.Id.ToString(), Live: true, StartTime: startMs)) as OkObjectResult;

        Assert.NotNull(result);
        var id = Assert.IsType<string>(result.Value);
        var entry = await _context.FrontHistory.FindAsync(Guid.Parse(id));
        Assert.NotNull(entry);
        Assert.Null(entry.FrontEnd);
    }

    [Fact]
    public async Task Create_InvalidMemberId_Returns400()
    {
        var result = await _controller.CreateAsync(new SpFrontCreateRequest(
            Member: Guid.NewGuid().ToString(), Live: true,
            StartTime: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_SetLiveFalse_SetsFrontEnd()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var endMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = await _controller.UpdateAsync(fh.Id.ToString(),
            new SpFrontUpdateRequest(Live: false, EndTime: endMs));

        Assert.IsType<OkResult>(result);
        var updated = await _context.FrontHistory.FindAsync(fh.Id);
        Assert.NotNull(updated!.FrontEnd);
    }

    [Fact]
    public async Task Delete_ExistingEntry_SoftDeletes()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteEntryAsync(fh.Id.ToString());
        Assert.IsType<OkResult>(result);

        var raw = await _context.FrontHistory.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == fh.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    [Fact]
    public async Task Update_WithMemberId_UpdatesMember()
    {
        var memberId = Guid.NewGuid();
        var newMemberId = Guid.NewGuid();
        var entry = new FrontHistory { Id = Guid.NewGuid(), MemberId = memberId, FrontStart = DateTime.UtcNow };
        _context.FrontHistory.Add(entry);
        await _context.SaveChangesAsync();

        var controller = new SpFrontController(_context);
        var result = await controller.UpdateAsync(
            entry.Id.ToString(),
            new SpFrontUpdateRequest(MemberId: newMemberId.ToString()));

        Assert.IsType<OkResult>(result);
        var updated = await _context.FrontHistory.FindAsync(entry.Id);
        Assert.Equal(newMemberId, updated!.MemberId);
    }

    [Fact]
    public async Task Update_WithStartTime_UpdatesFrontStart()
    {
        var entry = new FrontHistory { Id = Guid.NewGuid(), MemberId = Guid.NewGuid(), FrontStart = DateTime.UtcNow };
        _context.FrontHistory.Add(entry);
        await _context.SaveChangesAsync();

        var newStart = DateTimeOffset.UtcNow.AddHours(-2).ToUnixTimeMilliseconds();
        var controller = new SpFrontController(_context);
        var result = await controller.UpdateAsync(
            entry.Id.ToString(),
            new SpFrontUpdateRequest(StartTime: newStart));

        Assert.IsType<OkResult>(result);
        var updated = await _context.FrontHistory.FindAsync(entry.Id);
        Assert.Equal(Epoch.FromMs(newStart), updated!.FrontStart);
    }

    public void Dispose() => _context.Dispose();
}
