using Microsoft.Extensions.Configuration;

namespace PluralHost.Api.Services;

public interface IAvatarDownloadService
{
    /// <summary>
    /// Downloads the URL, validates content, stores in secure_uploads.
    /// Returns the local path on success, null on any failure (non-throwing).
    /// </summary>
    Task<string?> DownloadAvatarAsync(string url, CancellationToken ct = default);
}

public class AvatarDownloadService(HttpClient http, IConfiguration config) : IAvatarDownloadService
{
    private static readonly long MaxBytes = 5 * 1024 * 1024; // 5 MB

    private static readonly Dictionary<string, byte[]> MagicBytes = new()
    {
        ["jpg"] = [0xFF, 0xD8, 0xFF],
        ["png"] = [0x89, 0x50, 0x4E, 0x47],
        ["gif"] = [0x47, 0x49, 0x46],
        ["webp"] = [0x52, 0x49, 0x46, 0x46],
    };

    private static readonly HashSet<string> AllowedMimeTypes =
        ["image/jpeg", "image/png", "image/gif", "image/webp"];

    public async Task<string?> DownloadAvatarAsync(string url, CancellationToken ct = default)
    {
        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
            if (uri.Scheme != "http" && uri.Scheme != "https") return null;
            if (IsPrivateAddress(uri)) return null;

            using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) return null;

            var mime = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() ?? "";
            if (!AllowedMimeTypes.Contains(mime)) return null;

            var ext = mime switch
            {
                "image/jpeg" => "jpg",
                "image/png"  => "png",
                "image/gif"  => "gif",
                "image/webp" => "webp",
                _ => null
            };
            if (ext == null) return null;

            var stream = await response.Content.ReadAsStreamAsync(ct);
            var buffer = new byte[MaxBytes + 1];
            var bytesRead = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);

            if (bytesRead > MaxBytes) return null;

            // Magic bytes check
            var magic = MagicBytes[ext];
            if (bytesRead < magic.Length) return null;
            for (var i = 0; i < magic.Length; i++)
                if (buffer[i] != magic[i]) return null;

            // WebP extra check: bytes 8-11 must be "WEBP"
            if (ext == "webp")
            {
                if (bytesRead < 12) return null;
                // 'W'=0x57, 'E'=0x45, 'B'=0x42, 'P'=0x50
                if (buffer[8] != 0x57 || buffer[9] != 0x45 || buffer[10] != 0x42 || buffer[11] != 0x50)
                    return null;
            }

            var root = config["SecureUploads:Root"] ?? "secure_uploads";
            Directory.CreateDirectory(root);
            var filename = $"{Guid.NewGuid()}.{ext}";
            var path = Path.Combine(root, filename);
            await File.WriteAllBytesAsync(path, buffer[..bytesRead], ct);
            return path;
        }
        catch
        {
            return null; // any failure is non-fatal
        }
    }

    // Returns true if IP is private/loopback/link-local (SSRF protection)
    private static bool IsPrivateAddress(Uri uri)
    {
        var host = uri.Host.ToLowerInvariant();
        if (host == "localhost") return true;

        if (!System.Net.IPAddress.TryParse(host, out var ip))
        {
            // Hostname — allow (public DNS resolves it). Only raw IPs need SSRF checking.
            return false;
        }

        var bytes = ip.GetAddressBytes();
        if (bytes.Length != 4) return true; // IPv6 not supported — block, fail closed

        return (bytes[0] == 10) ||                                               // 10.x.x.x
               (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||         // 172.16-31.x.x
               (bytes[0] == 192 && bytes[1] == 168) ||                          // 192.168.x.x
               (bytes[0] == 127) ||                                               // 127.x.x.x loopback
               (bytes[0] == 169 && bytes[1] == 254) ||                          // 169.254.x.x link-local
               (bytes[0] == 0);                                                   // 0.x.x.x
    }
}
