using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class FieldsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly FieldsController _controller;

    public FieldsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new FieldsController(_context);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsField()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("Age", FieldType.Number, 0)) as OkObjectResult;
        var response = result!.Value as CustomFieldResponse;

        Assert.Equal("Age", response!.Label);
        Assert.Equal(FieldType.Number, response.FieldType);
        Assert.Null(response.DeletedAt);
    }

    [Fact]
    public async Task Create_MissingLabel_Returns400()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("", FieldType.Text));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_MissingFieldType_Returns400()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("Age", null));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task List_IncludesSoftDeletedEntries()
    {
        var field = new CustomField { Label = "Role", FieldType = FieldType.Text };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var fields = (result!.Value as IEnumerable<CustomFieldResponse>)!.ToList();

        Assert.Single(fields);
        Assert.NotNull(fields[0].DeletedAt);
    }

    [Fact]
    public async Task Patch_WithFieldType_Returns400()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var result = await _controller.PatchAsync(field.Id,
            new CustomFieldUpdateRequest(FieldType: FieldType.Text));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Patch_SoftDeletedField_Returns404()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.PatchAsync(field.Id,
            new CustomFieldUpdateRequest(Label: "New Label"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_CascadesSoftDeleteToValues()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        var member = new Member { Name = "Ember" };
        _context.CustomFields.Add(field);
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var value = new CustomFieldValue
        {
            FieldId = field.Id, MemberId = member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(value);
        await _context.SaveChangesAsync();

        await _controller.DeleteAsync(field.Id);

        var fieldInDb = await _context.CustomFields
            .IgnoreQueryFilters()
            .FirstAsync(f => f.Id == field.Id);
        var valueInDb = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync(v => v.Id == value.Id);

        Assert.NotNull(fieldInDb.DeletedAt);
        Assert.NotNull(valueInDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_AlreadyDeleted_Returns200()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(field.Id);
        Assert.IsType<OkResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
