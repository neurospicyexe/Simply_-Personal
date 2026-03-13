using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using PluralHost.Api.Controllers;

namespace PluralHost.Tests.Controllers;

public class MediaControllerTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly MediaController _controller;

    public MediaControllerTests()
    {
        // Create a real temp directory so path traversal tests have a concrete root
        _tempRoot = Path.Combine(Path.GetTempPath(), "pluralhost-media-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(_tempRoot);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SecureUploads:Root"] = _tempRoot
            })
            .Build();

        var envMock = new Mock<IWebHostEnvironment>();
        envMock.Setup(e => e.ContentRootPath).Returns(_tempRoot);

        _controller = new MediaController(config, envMock.Object);
    }

    [Fact]
    public void Get_ValidExistingFile_ReturnsPhysicalFileResult()
    {
        var testFile = Path.Combine(_tempRoot, "avatar.png");
        File.WriteAllBytes(testFile, new byte[] { 0x89, 0x50, 0x4E, 0x47 }); // PNG magic bytes

        var result = _controller.Get("avatar.png");

        Assert.IsType<PhysicalFileResult>(result);
    }

    [Fact]
    public void Get_FileNotFound_Returns404()
    {
        var result = _controller.Get("nonexistent.png");
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void Get_PathTraversalWithDotDot_Returns404()
    {
        var result = _controller.Get("../../etc/passwd");
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void Get_PathTraversalPrefixAttack_Returns404()
    {
        // e.g. a path that resolves to a directory exactly matching the root prefix but not under it
        // Simulate: uploadsRoot = /tmp/abc, path resolves to /tmp/abc-evil/file
        var result = _controller.Get("../pluralhost-evil/file.txt");
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void Get_NullByteInPath_Returns404()
    {
        var result = _controller.Get("file\0.txt");
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public void Get_ValidSubdirectoryFile_ReturnsPhysicalFileResult()
    {
        var subDir = Path.Combine(_tempRoot, "avatars");
        Directory.CreateDirectory(subDir);
        var testFile = Path.Combine(subDir, "member1.png");
        File.WriteAllBytes(testFile, new byte[] { 0x89, 0x50, 0x4E, 0x47 });

        var result = _controller.Get("avatars/member1.png");

        Assert.IsType<PhysicalFileResult>(result);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempRoot))
            Directory.Delete(_tempRoot, recursive: true);
    }
}
