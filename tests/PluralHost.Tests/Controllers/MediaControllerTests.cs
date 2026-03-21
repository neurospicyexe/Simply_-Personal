using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MediaControllerTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly MediaController _controller;

    // GET tests use the DI constructor (IConfiguration + IWebHostEnvironment)
    public MediaControllerTests()
    {
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

    public void Dispose()
    {
        if (Directory.Exists(_tempRoot))
            Directory.Delete(_tempRoot, recursive: true);
    }

    // ── GET tests ─────────────────────────────────────────────────────────

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

    // ── Upload tests ──────────────────────────────────────────────────────

    private static IFormFile MakeFile(byte[] content, string filename, string contentType)
    {
        var stream = new MemoryStream(content);
        return new FormFile(stream, 0, content.Length, "file", filename)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType,
        };
    }

    [Fact]
    public async Task Upload_ValidJpeg_Returns200WithId()
    {
        var uploadDir = Path.Combine(Path.GetTempPath(), "ph-upload-test-" + Guid.NewGuid());
        Directory.CreateDirectory(uploadDir);
        try
        {
            var ctrl = new MediaController(uploadDir);
            var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
            var file = MakeFile(bytes, "photo.jpg", "image/jpeg");

            var result = await ctrl.UploadAsync(file) as OkObjectResult;
            var response = result!.Value as UploadResponse;
            Assert.NotNull(response);
            Assert.EndsWith(".jpg", response!.Id);
            Assert.True(File.Exists(Path.Combine(uploadDir, response.Id)));
            Assert.True(new FileInfo(Path.Combine(uploadDir, response!.Id)).Length > 0);
        }
        finally
        {
            Directory.Delete(uploadDir, recursive: true);
        }
    }

    [Fact]
    public async Task Upload_FileTooLarge_Returns413()
    {
        var uploadDir = Path.Combine(Path.GetTempPath(), "ph-upload-test-" + Guid.NewGuid());
        Directory.CreateDirectory(uploadDir);
        try
        {
            var ctrl = new MediaController(uploadDir);
            var bytes = new byte[6 * 1024 * 1024];
            var file = MakeFile(bytes, "big.jpg", "image/jpeg");

            var result = await ctrl.UploadAsync(file);
            Assert.IsType<ObjectResult>(result);
            Assert.Equal(413, ((ObjectResult)result).StatusCode);
        }
        finally
        {
            Directory.Delete(uploadDir, recursive: true);
        }
    }

    [Fact]
    public async Task Upload_DisallowedExtension_Returns400()
    {
        var uploadDir = Path.Combine(Path.GetTempPath(), "ph-upload-test-" + Guid.NewGuid());
        Directory.CreateDirectory(uploadDir);
        try
        {
            var ctrl = new MediaController(uploadDir);
            var bytes = new byte[] { 0xFF, 0xD8, 0xFF };
            var file = MakeFile(bytes, "script.exe", "application/octet-stream");

            var result = await ctrl.UploadAsync(file);
            Assert.IsType<BadRequestObjectResult>(result);
        }
        finally
        {
            Directory.Delete(uploadDir, recursive: true);
        }
    }

    [Fact]
    public async Task Upload_MagicBytesMismatch_Returns400()
    {
        var uploadDir = Path.Combine(Path.GetTempPath(), "ph-upload-test-" + Guid.NewGuid());
        Directory.CreateDirectory(uploadDir);
        try
        {
            var ctrl = new MediaController(uploadDir);
            var bytes = new byte[] { 0xFF, 0xD8, 0xFF }; // JPEG bytes
            var file = MakeFile(bytes, "photo.png", "image/png"); // but .png extension

            var result = await ctrl.UploadAsync(file);
            Assert.IsType<BadRequestObjectResult>(result);
        }
        finally
        {
            Directory.Delete(uploadDir, recursive: true);
        }
    }
}
