namespace PluralHost.Api.Services;

public interface IGatekeeperService
{
    Task SetPinAsync(string plainPin);
    Task<bool> ValidatePinAsync(string plainPin);
    Task<bool> IsPinSetAsync();
}
