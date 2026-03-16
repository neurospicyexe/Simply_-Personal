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
            .ReturnsAsync(new ImportResult(1, 0, 0, 0, 0, []));
        _importService
            .Setup(s => s.ImportPkAsync(It.IsAny<PkImportRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ImportResult(1, 0, 0, 0, 0, []));
        _controller = new ImportController(_importService.Object);
    }

    [Fact]
    public async Task ImportSp_ValidRequest_Returns200WithResult()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        var result = await _controller.ImportSpAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.Equal(200, result!.StatusCode);
        Assert.IsType<ImportResult>(result!.Value);
    }

    [Fact]
    public async Task ImportPk_ValidRequest_Returns200WithResult()
    {
        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: "pk-uuid-001", Name: "Ember",
                DisplayName: null, Pronouns: null,
                Color: null, AvatarUrl: null, Description: null,
                Birthday: null, Privacy: null)],
            IncludeAvatars: false);

        var result = await _controller.ImportPkAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.Equal(200, result!.StatusCode);
        Assert.IsType<ImportResult>(result!.Value);
    }

    [Fact]
    public async Task ImportSp_EmptyMembers_Returns200()
    {
        var req = new SpImportRequest(Members: [], IncludeAvatars: false);

        var result = await _controller.ImportSpAsync(req, CancellationToken.None) as OkObjectResult;

        Assert.NotNull(result);
        Assert.IsType<ImportResult>(result!.Value);
    }
}
