using Microsoft.AspNetCore.Mvc;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class ImportControllerTests
{
    private readonly Mock<IImportService> _importService;
    private readonly ImportController _controller;

    public ImportControllerTests()
    {
        _importService = new Mock<IImportService>();
        _importService
            .Setup(s => s.ImportSpAsync(It.IsAny<SpImportRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ImportResult(1, 0, 0, [], 0, 0, 0));
        _importService
            .Setup(s => s.ImportPkAsync(It.IsAny<PkImportRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ImportResult(1, 0, 0, [], 0, 0, 0));
        _controller = new ImportController(_importService.Object);
    }

    [Fact]
    public async Task PostSp_ReturnsOkWithResult()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _controller.ImportSpAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.Equal(200, result!.StatusCode);
        Assert.IsType<ImportResult>(result!.Value);
    }

    [Fact]
    public async Task PostPk_ReturnsOkWithResult()
    {
        var req = new PkImportRequest(
            Token: "my-token",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: false,
            IncludeAvatars: false);

        var result = await _controller.ImportPkAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.Equal(200, result!.StatusCode);
        Assert.IsType<ImportResult>(result!.Value);
    }

    [Fact]
    public async Task PostSp_EmptyMembers_ReturnsOk()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [],
            CustomFields: null,
            FrontHistory: null);

        var result = await _controller.ImportSpAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.IsType<ImportResult>(result!.Value);
    }
}
