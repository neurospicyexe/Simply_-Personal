namespace PluralHost.Api.Services;

public interface IAuthService
{
    /// <summary>One-time setup of the login password. Returns false if already set.</summary>
    Task<bool> SetupPasswordAsync(string plainPassword);

    /// <summary>Validates credentials and returns a JWT. Returns null on bad credentials.</summary>
    Task<string?> LoginAsync(string plainPassword);

    /// <summary>Changes the login password after validating the Gatekeeper PIN.</summary>
    Task<bool> ChangePasswordAsync(string newPlainPassword, string gatekeeperPin);

    Task<bool> IsPasswordSetAsync();
}
