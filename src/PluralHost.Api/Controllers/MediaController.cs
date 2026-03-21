using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly string _uploadDir;
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();
    private const long MaxFileSizeBytes = 5 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    // Production constructor — resolved by ASP.NET Core DI
    public MediaController(IConfiguration configuration, IWebHostEnvironment env)
    {
        _uploadDir = Path.GetFullPath(
            configuration["SecureUploads:Root"] ?? Path.Combine(env.ContentRootPath, "secure_uploads"));
    }

    // Test constructor — accepts an explicit upload directory
    public MediaController(string uploadDir)
    {
        _uploadDir = uploadDir;
    }

    // GET /api/media/{*path} — serve secure_uploads behind JWT auth
    [HttpGet("{*path}")]
    public IActionResult Get(string path)
    {
        // Path traversal protection: check null byte first — Path.GetFullPath throws on it.
        // Use 404 (not 403) — don't leak that traversal was detected.
        if (path.Contains('\0'))
            return NotFound();

        var resolved = Path.GetFullPath(Path.Combine(_uploadDir, path));

        if (!resolved.StartsWith(_uploadDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            return NotFound();

        if (!System.IO.File.Exists(resolved))
            return NotFound();

        if (!ContentTypeProvider.TryGetContentType(resolved, out var contentType))
            contentType = "application/octet-stream";

        return PhysicalFile(resolved, contentType);
    }

    // POST /api/media/upload
    [HttpPost("upload")]
    public async Task<IActionResult> UploadAsync(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        if (file.Length > MaxFileSizeBytes)
            return StatusCode(413, new { error = "File exceeds 5 MB limit." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            return BadRequest(new { error = $"Extension '{ext}' is not allowed." });

        var header = new byte[12];
        using (var stream = file.OpenReadStream())
        {
            var read = await stream.ReadAsync(header.AsMemory(0, 12));
            if (read < 3)
                return BadRequest(new { error = "File too small to validate." });
        }

        if (!IsValidMagicBytes(ext, header))
            return BadRequest(new { error = "File content does not match its extension." });

        var savedName = $"{Guid.NewGuid()}{ext}";
        var savePath = Path.Combine(_uploadDir, savedName);
        Directory.CreateDirectory(_uploadDir);

        using (var dest = System.IO.File.Create(savePath))
        using (var src = file.OpenReadStream())
        {
            src.Seek(0, SeekOrigin.Begin);
            await src.CopyToAsync(dest);
        }

        return Ok(new UploadResponse(savedName));
    }

    private static bool IsValidMagicBytes(string ext, byte[] h) => ext switch
    {
        ".jpg" or ".jpeg" => h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF,
        ".png"  => h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47,
        ".gif"  => h[0] == 0x47 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x38
                   && (h[4] == 0x37 || h[4] == 0x39) && h[5] == 0x61,
        ".webp" => h[0] == 0x52 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x46
                   && h[8] == 0x57 && h[9] == 0x45 && h[10] == 0x42 && h[11] == 0x50,
        _ => false,
    };
}
