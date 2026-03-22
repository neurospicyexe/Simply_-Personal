using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class BucketsControllerTests : IDisposable
{
    private readonly PluralHostContext _ctx;
    private readonly BucketsController _sut;

    public BucketsControllerTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _ctx = new PluralHostContext(opts);
        SeedDefaults();
        _sut = new BucketsController(_ctx);
    }

    private void SeedDefaults()
    {
        _ctx.PrivacyBuckets.AddRange(
            new PrivacyBucket { Id = PrivacyBucket.PublicId,  Name = "Public",  SortOrder = 0, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.FriendId,  Name = "Friend",  SortOrder = 1, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.TrustedId, Name = "Trusted", SortOrder = 2, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.PrivateId, Name = "Private", SortOrder = 3, IsDefault = true });
        _ctx.SaveChanges();
    }

    [Fact]
    public async Task GetAll_ReturnsFourDefaults()
    {
        var result = await _sut.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var buckets = Assert.IsAssignableFrom<IEnumerable<BucketDto>>(ok.Value);
        Assert.Equal(4, buckets.Count());
    }

    [Fact]
    public async Task Create_AddsCustomBucket()
    {
        var req = new BucketCreateRequest("Test", null, "🔥", null);
        var result = await _sut.CreateAsync(req);
        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(5, _ctx.PrivacyBuckets.Count());
    }

    [Fact]
    public async Task Delete_DefaultBucket_Returns400()
    {
        var result = await _sut.DeleteAsync(PrivacyBucket.PublicId);
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("Default", bad.Value!.ToString());
    }

    [Fact]
    public async Task Delete_CustomBucket_SoftDeletes()
    {
        var custom = new PrivacyBucket { Name = "Custom", SortOrder = 10, IsDefault = false };
        _ctx.PrivacyBuckets.Add(custom);
        _ctx.SaveChanges();

        await _sut.DeleteAsync(custom.Id);
        var found = _ctx.PrivacyBuckets.IgnoreQueryFilters().First(b => b.Id == custom.Id);
        Assert.NotNull(found.DeletedAt);
    }

    public void Dispose() => _ctx.Dispose();
}
