using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class TokenVisibilityService : ITokenVisibilityService
{
    public IQueryable<Member> FilterByPermission(
        IQueryable<Member> members, TokenPermission permission)
    {
        if (permission == TokenPermission.ReadFrontOnly)
            throw new InvalidOperationException(
                "ReadFrontOnly tokens must not call FilterByPermission. " +
                "The front endpoint handles this case separately.");

        // Strict less-than because token enum is offset +1 from member enum:
        //   Public(1)  → tier < 1 → only Public(0)
        //   Friend(2)  → tier < 2 → Public(0), Friend(1)
        //   Trusted(3) → tier < 3 → Public(0), Friend(1), Trusted(2)
        var permInt = (int)permission;
        return members.Where(m => (int)m.PrivacyTier < permInt);
    }

    public bool CanPostToBoard(AccessToken token, Member member) =>
        (token.Permission == TokenPermission.Friend ||
         token.Permission == TokenPermission.Trusted) &&
        token.AllowsBoardPosting &&
        member.AllowsBoardPosting;
}
