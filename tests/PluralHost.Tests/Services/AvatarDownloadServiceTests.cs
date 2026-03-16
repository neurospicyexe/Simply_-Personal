using System.Net;
using System.Net.Http;
using Microsoft.Extensions.Configuration;
using Moq;
using Moq.Protected;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class AvatarDownloadServiceTests : IDisposable
{
    private readonly string _tempRoot;

    public AvatarDownloadServiceTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempRoot);
    }

    private static IAvatarDownloadService BuildService(
        HttpStatusCode status, byte[] content, string contentType = "image/jpeg")
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(status)
            {
                Content = new ByteArrayContent(content)
                { Headers = { ContentType = new(contentType) } }
            });
        var http = new HttpClient(handler.Object);
        return new AvatarDownloadService(http, new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SecureUploads:Root"] = Path.Combine(Path.GetTempPath(), "av-test-" + Guid.NewGuid())
            }).Build());
    }

    [Fact]
    public async Task Download_ValidJpeg_ReturnsPath()
    {
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var svc = BuildService(HttpStatusCode.OK, bytes, "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/avatar.jpg");

        Assert.NotNull(result);
        Assert.EndsWith(".jpg", result);
    }

    [Fact]
    public async Task Download_PrivateIpUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://192.168.1.1/evil.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_LocalhostUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://localhost/evil.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_AwsMetadataUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://169.254.169.254/latest/meta-data/");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_OversizeFile_ReturnsNull()
    {
        var big = new byte[6 * 1024 * 1024]; // 6 MB
        big[0] = 0xFF; big[1] = 0xD8; big[2] = 0xFF;
        var svc = BuildService(HttpStatusCode.OK, big, "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/big.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_WrongMimeType_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF], "text/html");

        var result = await svc.DownloadAvatarAsync("http://example.com/page.html");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_BadMagicBytes_ReturnsNull()
    {
        // Content-type says jpeg but magic bytes are wrong
        var svc = BuildService(HttpStatusCode.OK, [0x00, 0x00, 0x00], "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/fake.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_Http404_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.NotFound, []);

        var result = await svc.DownloadAvatarAsync("http://example.com/missing.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_NonHttpUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("file:///etc/passwd");

        Assert.Null(result);
    }

    public void Dispose() => Directory.Delete(_tempRoot, recursive: true);
}
