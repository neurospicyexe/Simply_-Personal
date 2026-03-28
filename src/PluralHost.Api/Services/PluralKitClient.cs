using System.Text.Json;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Services;

public interface IPluralKitClient
{
    Task<IReadOnlyList<PkApiMember>> GetMembersAsync(string token, CancellationToken ct = default);
    Task<IReadOnlyList<PkApiSwitch>> GetSwitchesAsync(string token, CancellationToken ct = default);
}

public class PluralKitClient(HttpClient http) : IPluralKitClient
{
    private const string BaseUrl = "https://api.pluralkit.me/v2/systems/@me";
    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public async Task<IReadOnlyList<PkApiMember>> GetMembersAsync(string token, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/members");
        req.Headers.TryAddWithoutValidation("Authorization", token);
        var resp = await http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<List<PkApiMember>>(json, JsonOpts) ?? [];
    }

    public async Task<IReadOnlyList<PkApiSwitch>> GetSwitchesAsync(string token, CancellationToken ct = default)
    {
        var all = new List<PkApiSwitch>();
        string? before = null;

        for (int page = 0; page < 10; page++)
        {
            var url = $"{BaseUrl}/switches?limit=100"
                + (before != null ? $"&before={Uri.EscapeDataString(before)}" : "");
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.TryAddWithoutValidation("Authorization", token);
            var resp = await http.SendAsync(req, ct);
            resp.EnsureSuccessStatusCode();
            var json = await resp.Content.ReadAsStringAsync(ct);
            var batch = JsonSerializer.Deserialize<List<PkApiSwitch>>(json, JsonOpts) ?? [];
            if (batch.Count == 0) break;
            all.AddRange(batch);
            if (batch.Count < 100) break;
            before = batch[^1].Timestamp;
        }

        // PK returns descending; sort ascending for EndTime computation
        all.Sort((a, b) => string.Compare(a.Timestamp, b.Timestamp, StringComparison.Ordinal));
        return all;
    }
}
