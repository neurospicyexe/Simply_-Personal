namespace PluralHost.Api.Domain;

public enum FieldType { Text, Multiline, Number, Date, Boolean }

public class CustomField : BaseEntity
{
    public string Label { get; set; } = string.Empty;
    public FieldType FieldType { get; set; } = FieldType.Text;
    public int SortOrder { get; set; } = 0;
    public string? SpFieldId { get; set; }   // SP MongoDB ObjectId, null if not imported from SP

    public ICollection<CustomFieldValue> Values { get; set; } = new List<CustomFieldValue>();
}
