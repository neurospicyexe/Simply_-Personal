using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/import")]
public class ImportController(IImportService importService) : ControllerBase
{
    [HttpPost("simply-plural")]
    public async Task<IActionResult> ImportSpAsync([FromBody] SpImportRequest body, CancellationToken ct)
    {
        var result = await importService.ImportSpAsync(body, ct);
        return Ok(result);
    }

    [HttpPost("plural-kit")]
    public async Task<IActionResult> ImportPkAsync([FromBody] PkImportRequest body, CancellationToken ct)
    {
        var result = await importService.ImportPkAsync(body, ct);
        return Ok(result);
    }
}
