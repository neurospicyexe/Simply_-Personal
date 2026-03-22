using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class TokenVisibilityService : ITokenVisibilityService
{
    public IQueryable<Member> FilterByPermission(IQueryable<Member> members, int minBucketSortOrder)
    {
        if (minBucketSortOrder == -1)
            throw new InvalidOperationException(
                "ReadFrontOnly tokens (MinBucketSortOrder = -1) must not call FilterByPermission. " +
                "The front endpoint handles this case separately.");

        return members.Where(m => m.Bucket!.SortOrder <= minBucketSortOrder);
    }

    public bool CanPostToBoard(AccessToken token, Member member) =>
        token.MinBucketSortOrder >= 1 &&
        token.AllowsBoardPosting &&
        member.AllowsBoardPosting;
}
