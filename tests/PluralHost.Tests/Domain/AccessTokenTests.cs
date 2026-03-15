using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class AccessTokenTests
{
    [Fact]
    public void IsValid_WhenActiveAndNotExpired_ReturnsTrue()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            Label = "Shared with Partner"
        };
        Assert.True(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenExpired_ReturnsFalse()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddHours(-1),
        };
        Assert.False(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenRevoked_ReturnsFalse()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            RevokedAt = DateTime.UtcNow.AddMinutes(-5)
        };
        Assert.False(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenNullExpiry_ReturnsTrue()
    {
        // Tokens with no expiry are permanent until revoked
        var token = new AccessToken { TokenValue = "abc123" };
        Assert.True(token.IsValid());
    }

    [Fact]
    public void AccessToken_DefaultAllowsBoardPosting_IsFalse()
    {
        var t = new AccessToken { TokenValue = "test" };
        Assert.False(t.AllowsBoardPosting);
    }

    [Fact]
    public void TokenPermission_PublicHasIntValue1()
    {
        Assert.Equal(1, (int)TokenPermission.Public);
    }

    [Fact]
    public void TokenPermission_ReadFrontOnlyHasIntValue0()
    {
        Assert.Equal(0, (int)TokenPermission.ReadFrontOnly);
    }
}
