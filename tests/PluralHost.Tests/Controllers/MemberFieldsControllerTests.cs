using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MemberFieldsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly MemberFieldsController _controller;
    private Member _member = null!;
    private CustomField _field = null!;

    public MemberFieldsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new MemberFieldsController(_context);
    }

    private async Task SeedAsync()
    {
        _member = new Member { Name = "Ember" };
        _field = new CustomField { Label = "Age", FieldType = FieldType.Number, SortOrder = 0 };
        _context.Members.Add(_member);
        _context.CustomFields.Add(_field);
        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task Get_UnknownMember_Returns404()
    {
        var result = await _controller.GetAsync(Guid.NewGuid());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Get_ReturnsAllFieldsWithBlankForUnset()
    {
        await SeedAsync();

        var result = await _controller.GetAsync(_member.Id) as OkObjectResult;
        var entries = (result!.Value as IEnumerable<MemberFieldEntry>)!.ToList();

        Assert.Single(entries);
        Assert.Equal("Age", entries[0].Label);
        Assert.Null(entries[0].Value);  // not set yet
    }

    [Fact]
    public async Task Get_ReturnsSetValue()
    {
        await SeedAsync();
        _context.CustomFieldValues.Add(new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id,
            Value = "25", BucketId = PrivacyBucket.TrustedId
        });
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync(_member.Id) as OkObjectResult;
        var entries = (result!.Value as IEnumerable<MemberFieldEntry>)!.ToList();

        Assert.Equal("25", entries[0].Value);
        Assert.Equal(PrivacyBucket.TrustedId, entries[0].BucketId);
    }

    [Fact]
    public async Task Put_NewValue_CreatesRow()
    {
        await SeedAsync();

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("25")) as OkObjectResult;
        var response = result!.Value as CustomFieldValueResponse;

        Assert.Equal("25", response!.Value);
        Assert.Equal(PrivacyBucket.PublicId, response.BucketId);
    }

    [Fact]
    public async Task Put_ExistingValue_UpdatesRow()
    {
        await SeedAsync();
        _context.CustomFieldValues.Add(new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        });
        await _context.SaveChangesAsync();

        await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("30"));

        var count = await _context.CustomFieldValues.CountAsync();
        var value = await _context.CustomFieldValues.FirstAsync();
        Assert.Equal(1, count);
        Assert.Equal("30", value.Value);
    }

    [Fact]
    public async Task Put_SoftDeletedValue_RestoresAndUpdates()
    {
        await SeedAsync();
        var val = new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(val);
        await _context.SaveChangesAsync();
        val.SoftDelete();
        await _context.SaveChangesAsync();

        await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("99"));

        var restored = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync(v => v.Id == val.Id);

        Assert.Null(restored.DeletedAt);
        Assert.Equal("99", restored.Value);
    }

    [Fact]
    public async Task Put_DeletedField_Returns400()
    {
        await SeedAsync();
        _field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("25"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidNumberValue_Returns400()
    {
        await SeedAsync(); // field is Number type

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("banana"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidDateValue_Returns400()
    {
        var member = new Member { Name = "X" };
        var dateField = new CustomField { Label = "Birthday", FieldType = FieldType.Date };
        _context.Members.Add(member);
        _context.CustomFields.Add(dateField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, dateField.Id,
            new CustomFieldValueUpsertRequest("not-a-date"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidBooleanValue_Returns400()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Driving", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest("yes"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForTextField_Succeeds()
    {
        var member = new Member { Name = "X" };
        var textField = new CustomField { Label = "Notes", FieldType = FieldType.Text };
        _context.Members.Add(member);
        _context.CustomFields.Add(textField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, textField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Delete_SoftDeletesValue()
    {
        await SeedAsync();
        var val = new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(val);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, _field.Id);
        Assert.IsType<OkResult>(result);

        var inDb = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync();
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_NoValueRow_Returns404()
    {
        await SeedAsync();
        // No value row exists for this member+field pair
        var result = await _controller.DeleteAsync(_member.Id, _field.Id);
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForNumber_Returns400()
    {
        await SeedAsync(); // field is Number type
        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForDate_Returns400()
    {
        var member = new Member { Name = "X" };
        var dateField = new CustomField { Label = "Birthday", FieldType = FieldType.Date };
        _context.Members.Add(member);
        _context.CustomFields.Add(dateField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, dateField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForBoolean_Returns400()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Driving", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_BooleanValueCaseSensitive_UpperCaseRejected()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Active", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        // Must be lowercase "true"/"false" only
        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest("True"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
