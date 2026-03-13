using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController(IConfiguration configuration, IWebHostEnvironment env) : ControllerBase
{
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    // GET /api/media/{*path} — Serve secure_uploads behind JWT auth
    [HttpGet("{*path}")]
    public IActionResult Get(string path)
    {
        var uploadsRoot = Path.GetFullPath(
            configuration["SecureUploads:Root"] ?? Path.Combine(env.ContentRootPath, "secure_uploads"));

        // Path traversal protection: check null byte first — Path.GetFullPath throws on it.
        // Use 404 (not 403) — don't leak that traversal was detected.
        if (path.Contains('\0'))
            return NotFound();

        var resolved = Path.GetFullPath(Path.Combine(uploadsRoot, path));

        if (!resolved.StartsWith(uploadsRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            return NotFound();

        if (!System.IO.File.Exists(resolved))
            return NotFound();

        if (!ContentTypeProvider.TryGetContentType(resolved, out var contentType))
            contentType = "application/octet-stream";

        return PhysicalFile(resolved, contentType);
    }
}
