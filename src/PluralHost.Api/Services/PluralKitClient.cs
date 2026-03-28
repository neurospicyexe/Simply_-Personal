using PluralHost.Api.Dto;

namespace PluralHost.Api.Services;

public interface IPluralKitClient
{
    Task<IReadOnlyList<PkApiMember>> GetMembersAsync(string token, CancellationToken ct = default);
    Task<IReadOnlyList<PkApiSwitch>> GetSwitchesAsync(string token, CancellationToken ct = default);
}
