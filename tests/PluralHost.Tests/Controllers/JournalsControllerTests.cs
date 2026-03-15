using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class JournalsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly JournalsController _controller;

    public JournalsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new JournalsController(_context);
    }

    [Fact]
    public async Task Create_DefaultsIsPrivateToTrue()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest("Today was okay.")) as OkObjectResult;
        var response = result!.Value as JournalEntryResponse;

        Assert.True(response!.IsPrivate);
    }

    [Fact]
    public async Task Create_MissingContent_Returns400()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithTitle_StoresTitle()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest("Body", "My Title")) as OkObjectResult;
        var response = result!.Value as JournalEntryResponse;

        Assert.Equal("My Title", response!.Title);
    }

    [Fact]
    public async Task List_OrdersByCreatedAtDesc()
    {
        _context.JournalEntries.AddRange(
            new JournalEntry { Content = "First", CreatedAt = DateTime.UtcNow.AddDays(-2) },
            new JournalEntry { Content = "Second", CreatedAt = DateTime.UtcNow.AddDays(-1) }
        );
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var entries = (result!.Value as IEnumerable<JournalEntryResponse>)!.ToList();

        Assert.Equal("Second", entries[0].Content);
        Assert.Equal("First", entries[1].Content);
    }

    [Fact]
    public async Task List_ExcludesSoftDeleted()
    {
        var entry = new JournalEntry { Content = "Gone" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();
        entry.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var entries = (result!.Value as IEnumerable<JournalEntryResponse>)!.ToList();

        Assert.Empty(entries);
    }

    [Fact]
    public async Task Patch_UpdatesIsPrivate()
    {
        var entry = new JournalEntry { Content = "Hello", IsPrivate = true };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.PatchAsync(entry.Id,
            new JournalUpdateRequest(IsPrivate: false));

        var updated = await _context.JournalEntries.FirstAsync();
        Assert.False(updated.IsPrivate);
    }

    [Fact]
    public async Task Patch_UpdatesContent()
    {
        var entry = new JournalEntry { Content = "Original" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.PatchAsync(entry.Id,
            new JournalUpdateRequest(Content: "Updated"));

        var updated = await _context.JournalEntries.FirstAsync();
        Assert.Equal("Updated", updated.Content);
    }

    [Fact]
    public async Task Delete_SoftDeletesOnly()
    {
        var entry = new JournalEntry { Content = "Hello" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.DeleteAsync(entry.Id);

        var inDb = await _context.JournalEntries
            .IgnoreQueryFilters()
            .FirstAsync();

        Assert.NotNull(inDb.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
