namespace PluralHost.Api.Domain;

public class FrontStatus : BaseEntity
{
    public required string Label { get; set; }
    public string? Color { get; set; }
    public bool IsDefault { get; set; } = false;
    public bool IsHidden { get; set; } = false;

    public List<FrontHistory> FrontHistories { get; set; } = [];

    // Stable GUIDs — never change these; they are baked into migrations
    public static class SeedIds
    {
        public static readonly Guid CoCon            = new("a1000000-0000-0000-0000-000000000001");
        public static readonly Guid Blending         = new("a1000000-0000-0000-0000-000000000002");
        public static readonly Guid Switching        = new("a1000000-0000-0000-0000-000000000003");
        public static readonly Guid Stressed         = new("a1000000-0000-0000-0000-000000000004");
        public static readonly Guid Dissociating     = new("a1000000-0000-0000-0000-000000000005");
        public static readonly Guid Foggy            = new("a1000000-0000-0000-0000-000000000006");
        public static readonly Guid PassiveInfluence = new("a1000000-0000-0000-0000-000000000007");
        public static readonly Guid FullSwitch       = new("a1000000-0000-0000-0000-000000000008");
        public static readonly Guid PartialSwitch    = new("a1000000-0000-0000-0000-000000000009");
        public static readonly Guid FrontingAlone    = new("a1000000-0000-0000-0000-000000000010");
    }
}
